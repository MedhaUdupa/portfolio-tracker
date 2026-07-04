import { useState } from "react";

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  account_id: "",
  ticker_symbol: "",
  trade_type: "Buy",
  quantity: "",
  price: "",
  date: today(),
};

/**
 * Manual trade entry form.
 *
 * Validates locally before posting (all fields required, positive numbers),
 * surfaces backend errors (e.g. selling more than held), and calls
 * `onSaved` so the dashboard refreshes after a successful save.
 */
export default function TradeForm({ accounts, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setSuccess(null);
  };

  const validate = () => {
    const errs = {};
    if (!form.account_id) errs.account_id = "Choose an account";
    if (!form.ticker_symbol.trim()) errs.ticker_symbol = "Enter a ticker";
    if (!form.quantity || Number(form.quantity) <= 0)
      errs.quantity = "Quantity must be greater than 0";
    if (!form.price || Number(form.price) <= 0)
      errs.price = "Price must be greater than 0";
    if (!form.date) errs.date = "Choose a date";
    return errs;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSuccess(null);

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: Number(form.account_id),
          ticker_symbol: form.ticker_symbol.trim().toUpperCase(),
          trade_type: form.trade_type,
          quantity: Number(form.quantity),
          price: Number(form.price),
          date: form.date,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : "Could not save the trade. Check the values and try again."
        );
      }

      const saved = await res.json();
      setSuccess(
        `Logged ${saved.trade_type.toLowerCase()} of ${saved.quantity} × ${form.ticker_symbol
          .trim()
          .toUpperCase()}`
      );
      // Keep account + date selected for fast repeated daily entries.
      setForm((f) => ({ ...EMPTY, account_id: f.account_id, date: f.date }));
      onSaved();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (key) =>
    `w-full rounded-md bg-ink border px-3 py-2 font-mono text-sm text-paper placeholder:text-mist/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
      fieldErrors[key] ? "border-coral" : "border-line"
    }`;

  return (
    <aside className="bg-panel border border-line rounded-xl p-5 h-fit lg:sticky lg:top-6">
      <h2 className="font-display font-bold text-lg mb-1">Log a trade</h2>
      <p className="text-mist text-sm mb-5">
        Enter today's investment manually. It appears in the dashboard
        immediately.
      </p>

      <div className="space-y-4">
        {/* Account */}
        <div>
          <label className="block text-xs font-mono text-mist mb-1" htmlFor="account">
            Account
          </label>
          <select
            id="account"
            value={form.account_id}
            onChange={set("account_id")}
            className={inputClass("account_id")}
          >
            <option value="">Select account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {fieldErrors.account_id && (
            <p className="text-coral text-xs mt-1">{fieldErrors.account_id}</p>
          )}
        </div>

        {/* Buy / Sell toggle */}
        <div>
          <span className="block text-xs font-mono text-mist mb-1">Trade type</span>
          <div className="grid grid-cols-2 gap-2">
            {["Buy", "Sell"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, trade_type: t }))}
                className={`rounded-md py-2 font-mono text-sm border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  form.trade_type === t
                    ? t === "Buy"
                      ? "bg-mint/15 border-mint text-mint"
                      : "bg-coral/15 border-coral text-coral"
                    : "bg-ink border-line text-mist hover:text-paper"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Ticker */}
        <div>
          <label className="block text-xs font-mono text-mist mb-1" htmlFor="ticker">
            Ticker symbol
          </label>
          <input
            id="ticker"
            type="text"
            placeholder="e.g. AAPL"
            value={form.ticker_symbol}
            onChange={set("ticker_symbol")}
            className={inputClass("ticker_symbol") + " uppercase"}
          />
          {fieldErrors.ticker_symbol && (
            <p className="text-coral text-xs mt-1">{fieldErrors.ticker_symbol}</p>
          )}
        </div>

        {/* Quantity + Price */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-mist mb-1" htmlFor="qty">
              Quantity
            </label>
            <input
              id="qty"
              type="number"
              min="0"
              step="any"
              placeholder="10"
              value={form.quantity}
              onChange={set("quantity")}
              className={inputClass("quantity")}
            />
            {fieldErrors.quantity && (
              <p className="text-coral text-xs mt-1">{fieldErrors.quantity}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-mono text-mist mb-1" htmlFor="price">
              Price per share
            </label>
            <input
              id="price"
              type="number"
              min="0"
              step="any"
              placeholder="182.50"
              value={form.price}
              onChange={set("price")}
              className={inputClass("price")}
            />
            {fieldErrors.price && (
              <p className="text-coral text-xs mt-1">{fieldErrors.price}</p>
            )}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-mono text-mist mb-1" htmlFor="date">
            Trade date
          </label>
          <input
            id="date"
            type="date"
            max={today()}
            value={form.date}
            onChange={set("date")}
            className={inputClass("date")}
          />
          {fieldErrors.date && (
            <p className="text-coral text-xs mt-1">{fieldErrors.date}</p>
          )}
        </div>

        {submitError && (
          <div className="rounded-md border border-coral/50 bg-coral/10 text-coral px-3 py-2 text-sm">
            {submitError}
          </div>
        )}
        {success && (
          <div className="rounded-md border border-mint/50 bg-mint/10 text-mint px-3 py-2 text-sm">
            {success}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-md bg-gold text-ink font-display font-bold py-2.5 hover:brightness-110 disabled:opacity-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-paper"
        >
          {saving ? "Saving…" : "Save trade"}
        </button>
      </div>
    </aside>
  );
}
