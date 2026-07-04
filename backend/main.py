"""
Unified Stock Portfolio Tracker — FastAPI backend.

- 100% manual data entry (no CSV parsers, no market-data APIs).
- SQLite locally (zero config); Postgres in production via DATABASE_URL.
- Seeds three default brokerage accounts on first run.
- In production, also serves the built React frontend from ../frontend/dist.

Run locally with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date
from enum import Enum
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import (
    Date,
    Float,
    ForeignKey,
    String,
    create_engine,
    select,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

# ---------------------------------------------------------------------------
# Database setup — SQLite locally, Postgres (e.g. Neon) in production
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./portfolio.db")

# Some providers hand out URLs starting with "postgres://", which
# SQLAlchemy 2.x no longer accepts — normalize to "postgresql://".
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine_kwargs: dict = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    # Required for SQLite with FastAPI's threaded request handling.
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


# ---------------------------------------------------------------------------
# ORM models
# ---------------------------------------------------------------------------


class TradeType(str, Enum):
    BUY = "Buy"
    SELL = "Sell"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker_symbol: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="asset")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)
    trade_type: Mapped[str] = mapped_column(String(4), nullable=False)  # "Buy" / "Sell"
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)

    account: Mapped[Account] = relationship(back_populates="transactions")
    asset: Mapped[Asset] = relationship(back_populates="transactions")


# ---------------------------------------------------------------------------
# Pydantic schemas (request / response models)
# ---------------------------------------------------------------------------


class TransactionCreate(BaseModel):
    """Payload for logging a manual trade from the frontend form."""

    account_id: int = Field(..., gt=0, description="ID of the brokerage account")
    ticker_symbol: str = Field(..., min_length=1, max_length=20)
    trade_type: TradeType = TradeType.BUY
    quantity: float = Field(..., gt=0, description="Number of shares")
    price: float = Field(..., gt=0, description="Price per share")
    date: date

    @field_validator("ticker_symbol")
    @classmethod
    def normalize_ticker(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if not cleaned:
            raise ValueError("Ticker symbol cannot be blank")
        return cleaned


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    asset_id: int
    trade_type: str
    quantity: float
    price: float
    date: date


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class TransactionHistoryOut(BaseModel):
    """Transaction enriched with display names for the history table."""

    id: int
    account_id: int
    account_name: str
    ticker_symbol: str
    trade_type: str
    quantity: float
    price: float
    total_value: float
    date: date


class HoldingOut(BaseModel):
    """A single asset position, aggregated from Buy/Sell transactions."""

    ticker_symbol: str
    total_quantity: float
    average_buy_price: float
    invested_amount: float  # total_quantity * average_buy_price


class PortfolioOut(BaseModel):
    account_id: int | None  # None means "all accounts"
    account_name: str
    total_invested: float
    holdings: list[HoldingOut]


class ComparisonOut(BaseModel):
    """Side-by-side portfolio snapshot for every account."""

    accounts: list[PortfolioOut]
    grand_total: float


# ---------------------------------------------------------------------------
# App + lifecycle (create tables, seed default accounts)
# ---------------------------------------------------------------------------


DEFAULT_ACCOUNTS = ["Account 1", "Account 2", "Account 3"]


def seed_accounts(db: Session) -> None:
    """Insert the three default accounts if they don't already exist."""
    existing = {name for (name,) in db.execute(select(Account.name)).all()}
    for name in DEFAULT_ACCOUNTS:
        if name not in existing:
            db.add(Account(name=name))
    db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_accounts(db)
    yield


app = FastAPI(title="Unified Stock Portfolio Tracker", lifespan=lifespan)

# Allow the Vite dev server to talk to this API during local development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    """FastAPI dependency: yields a scoped database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Portfolio math
# ---------------------------------------------------------------------------


def compute_holdings(transactions: list[Transaction]) -> list[HoldingOut]:
    """
    Aggregate raw transactions into per-asset holdings.

    Average buy price uses the weighted average cost method:
    - Buys increase quantity and add to cost basis at the trade price.
    - Sells decrease quantity and reduce cost basis at the *average* price
      (the average itself is unchanged by a sell, which is standard).
    Positions that net out to zero (or negative) are excluded.
    """
    positions: dict[str, dict[str, float]] = {}

    # Process in chronological order so the running average is correct.
    for txn in sorted(transactions, key=lambda t: (t.date, t.id)):
        ticker = txn.asset.ticker_symbol
        pos = positions.setdefault(ticker, {"qty": 0.0, "cost": 0.0})

        if txn.trade_type == TradeType.BUY.value:
            pos["qty"] += txn.quantity
            pos["cost"] += txn.quantity * txn.price
        else:  # Sell
            avg = pos["cost"] / pos["qty"] if pos["qty"] > 0 else 0.0
            pos["qty"] -= txn.quantity
            pos["cost"] -= txn.quantity * avg
            # Guard against tiny float drift or over-selling.
            if pos["qty"] <= 1e-9:
                pos["qty"] = 0.0
                pos["cost"] = 0.0

    holdings: list[HoldingOut] = []
    for ticker, pos in positions.items():
        if pos["qty"] <= 0:
            continue
        avg_price = pos["cost"] / pos["qty"]
        holdings.append(
            HoldingOut(
                ticker_symbol=ticker,
                total_quantity=round(pos["qty"], 6),
                average_buy_price=round(avg_price, 4),
                invested_amount=round(pos["cost"], 2),
            )
        )

    # Largest positions first — nicer for the dashboard table and chart.
    holdings.sort(key=lambda h: h.invested_amount, reverse=True)
    return holdings


def build_portfolio(
    db: Session, account_id: int | None
) -> PortfolioOut:
    """Shared logic for the aggregated and per-account portfolio endpoints."""
    if account_id is not None:
        account = db.get(Account, account_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        account_name = account.name
        stmt = select(Transaction).where(Transaction.account_id == account_id)
    else:
        account_name = "All accounts"
        stmt = select(Transaction)

    transactions = list(db.scalars(stmt).all())
    holdings = compute_holdings(transactions)
    total_invested = round(sum(h.invested_amount for h in holdings), 2)

    return PortfolioOut(
        account_id=account_id,
        account_name=account_name,
        total_invested=total_invested,
        holdings=holdings,
    )


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@app.get("/api/accounts", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_db)) -> list[Account]:
    """List all brokerage accounts (used to populate the form dropdown/tabs)."""
    return list(db.scalars(select(Account).order_by(Account.id)).all())


@app.post("/api/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(
    payload: TransactionCreate, db: Session = Depends(get_db)
) -> Transaction:
    """Log a new manual trade. Creates the Asset row on first use of a ticker."""
    account = db.get(Account, payload.account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    # Find or create the asset for this ticker.
    asset = db.scalar(
        select(Asset).where(Asset.ticker_symbol == payload.ticker_symbol)
    )
    if asset is None:
        asset = Asset(ticker_symbol=payload.ticker_symbol)
        db.add(asset)
        db.flush()  # assigns asset.id without committing yet

    # Prevent selling more than is currently held in this account.
    if payload.trade_type == TradeType.SELL:
        held = compute_holdings(
            list(
                db.scalars(
                    select(Transaction).where(
                        Transaction.account_id == payload.account_id,
                        Transaction.asset_id == asset.id,
                    )
                ).all()
            )
        )
        held_qty = held[0].total_quantity if held else 0.0
        if payload.quantity > held_qty + 1e-9:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot sell {payload.quantity} shares of "
                    f"{payload.ticker_symbol}: only {held_qty} held in this account."
                ),
            )

    txn = Transaction(
        account_id=payload.account_id,
        asset_id=asset.id,
        trade_type=payload.trade_type.value,
        quantity=payload.quantity,
        price=payload.price,
        date=payload.date,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@app.get("/api/portfolio", response_model=PortfolioOut)
def get_portfolio(db: Session = Depends(get_db)) -> PortfolioOut:
    """Holdings aggregated across all accounts."""
    return build_portfolio(db, account_id=None)


@app.get("/api/portfolio-comparison", response_model=ComparisonOut)
def get_portfolio_comparison(db: Session = Depends(get_db)) -> ComparisonOut:
    """One portfolio snapshot per account, for the side-by-side view."""
    accounts = list(db.scalars(select(Account).order_by(Account.id)).all())
    snapshots = [build_portfolio(db, account_id=a.id) for a in accounts]
    return ComparisonOut(
        accounts=snapshots,
        grand_total=round(sum(s.total_invested for s in snapshots), 2),
    )


@app.get("/api/portfolio/{account_id}", response_model=PortfolioOut)
def get_portfolio_for_account(
    account_id: int, db: Session = Depends(get_db)
) -> PortfolioOut:
    """Holdings filtered to a single account."""
    return build_portfolio(db, account_id=account_id)


@app.get("/api/transactions", response_model=list[TransactionHistoryOut])
def list_transactions(
    account_id: int | None = None, db: Session = Depends(get_db)
) -> list[TransactionHistoryOut]:
    """Full trade history (newest first), optionally filtered by account."""
    stmt = select(Transaction)
    if account_id is not None:
        if db.get(Account, account_id) is None:
            raise HTTPException(status_code=404, detail="Account not found")
        stmt = stmt.where(Transaction.account_id == account_id)

    txns = list(db.scalars(stmt).all())
    txns.sort(key=lambda t: (t.date, t.id), reverse=True)
    return [
        TransactionHistoryOut(
            id=t.id,
            account_id=t.account_id,
            account_name=t.account.name,
            ticker_symbol=t.asset.ticker_symbol,
            trade_type=t.trade_type,
            quantity=t.quantity,
            price=t.price,
            total_value=round(t.quantity * t.price, 2),
            date=t.date,
        )
        for t in txns
    ]


@app.delete("/api/transactions/{transaction_id}", status_code=204, response_class=Response)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)) -> Response:
    """
    Delete a logged trade (e.g. to correct a data-entry mistake).

    Deletion is blocked if removing this transaction would leave the account
    with a negative position in that asset (i.e. later sells would exceed
    what was bought) — that would corrupt the average-cost math.
    """
    txn = db.get(Transaction, transaction_id)
    if txn is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if txn.trade_type == TradeType.BUY.value:
        remaining = [
            t
            for t in db.scalars(
                select(Transaction).where(
                    Transaction.account_id == txn.account_id,
                    Transaction.asset_id == txn.asset_id,
                )
            ).all()
            if t.id != transaction_id
        ]
        qty = sum(
            t.quantity if t.trade_type == TradeType.BUY.value else -t.quantity
            for t in remaining
        )
        if qty < -1e-9:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Cannot delete this buy: later sells of "
                    f"{txn.asset.ticker_symbol} depend on it. "
                    "Delete the sell transactions first."
                ),
            )

    db.delete(txn)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Static frontend (production single-service deployment)
# ---------------------------------------------------------------------------
# If the React app has been built (frontend/dist exists), serve it from this
# same FastAPI service. The frontend uses relative /api/... URLs, so serving
# both from one origin removes any CORS concerns in production. During local
# development this block is skipped and the Vite dev server proxies instead.

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str) -> FileResponse:
        """SPA fallback: serve real files if they exist, else index.html."""
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
