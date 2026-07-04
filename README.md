# Unified Stock Portfolio Tracker

Manual-entry portfolio tracker across 3 brokerage accounts. No CSV parsers,
no market-data APIs — all data comes from the trade form in the UI.

## Structure

```
backend/
  main.py            # FastAPI app, SQLAlchemy models, SQLite, endpoints
  requirements.txt
frontend/
  package.json
  vite.config.js     # proxies /api -> localhost:8000
  tailwind.config.js
  postcss.config.js
  index.html
  src/
    main.jsx
    index.css
    App.jsx                    # state, tabs, data fetching
    components/TradeForm.jsx   # manual entry form with validation
    components/Dashboard.jsx   # totals, Recharts chart, holdings table
```

## Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Creates `portfolio.db` automatically and seeds Account 1 / 2 / 3.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The Vite proxy forwards `/api/*` to the backend,
so no CORS setup is needed in dev (CORS headers are also enabled server-side
as a fallback).

## API

- `GET    /api/accounts` — list accounts (populates the form + tabs)
- `POST   /api/transactions` — log a manual Buy/Sell
- `GET    /api/transactions?account_id=` — trade history, newest first
- `DELETE /api/transactions/{id}` — remove a trade (blocked if later sells depend on it)
- `GET    /api/portfolio` — holdings aggregated across all accounts
- `GET    /api/portfolio/{account_id}` — holdings for one account
- `GET    /api/portfolio-comparison` — per-account snapshots for the side-by-side view

## Frontend views

- **Holdings** — total invested, allocation chart, breakdown table (filterable by account tab)
- **Compare accounts** — one card per account + grouped bar chart of invested amount per asset per account
- **History** — full trade log with two-step delete to fix entry mistakes

Average buy price uses the weighted-average-cost method; sells reduce the
position at its running average and can't exceed the quantity held.

## Deploy for free (Render + Neon)

The app deploys as ONE free web service: the build step compiles the React
frontend and FastAPI serves it, so there's a single URL and no CORS config.
Render's free filesystem is ephemeral (SQLite would be wiped on every
restart), so production data lives in a free Neon Postgres database instead.
The code switches automatically based on the DATABASE_URL env var.

1. Push this folder to a GitHub repository.
2. Create a free database at https://neon.tech (no credit card). Copy the
   connection string (postgresql://...).
3. On https://render.com, choose "New +" -> "Blueprint", point it at your
   repo — it reads render.yaml automatically. (Or create a Web Service
   manually: build command `./build.sh`, start command
   `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`.)
4. Set the DATABASE_URL environment variable to your Neon connection string.
5. Deploy. Tables are created and accounts seeded automatically on first boot.

Free-tier notes: the Render service spins down after 15 minutes of
inactivity, so the first visit after a quiet period takes ~30-60s to wake
up. Your data is safe in Neon regardless. Locally, nothing changes — with
no DATABASE_URL set, it falls back to SQLite.
