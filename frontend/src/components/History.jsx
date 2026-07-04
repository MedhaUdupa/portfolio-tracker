import { useState } from "react";

const currency = (n) =>
  n.toLocaleString("en-IN", { style: "currency", currency: "INR" });

/**
 * Trade history table with per-row delete.
 *
 * `transactions` comes from GET /api/transactions (already newest-first).
 * Deleting calls DELETE /api/transactions/{id}; the backend rejects deletes
 * that would break position math (e.g. removing a buy that later sells
 * depend on), and that error is shown inline.
 */
export default function History({ transactions, onChanged }) {
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const handleDelete = async (id) => {
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.detail === "string"
            ? body.detail
            : "Could not delete the trade."
        );
      }
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="bg-panel border border-dashed border-line rounded-xl p-10 text-center">
        <p className="font-display font-bold mb-1">No trades logged yet</p>
        <p className="text-mist text-sm">
          Every trade you save appears here and can be deleted to fix
          mistakes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-coral/50 bg-coral/10 text-coral px-3 py-2 text-sm">
          {error}
        </div>
      )}
      <div className="bg-panel border border-line rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-line text-left font-mono text-xs text-mist uppercase tracking-wider">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {transactions.map((t) => (
              <tr
                key={t.id}
                className="border-b border-line/50 last:border-0 hover:bg-ink/40"
              >
                <td className="px-4 py-2.5 text-mist">{t.date}</td>
                <td className="px-4 py-2.5">{t.account_name}</td>
                <td className="px-4 py-2.5 font-medium text-gold">
                  {t.ticker_symbol}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      t.trade_type === "Buy" ? "text-mint" : "text-coral"
                    }
                  >
                    {t.trade_type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">{t.quantity}</td>
                <td className="px-4 py-2.5 text-right">{currency(t.price)}</td>
                <td className="px-4 py-2.5 text-right">
                  {currency(t.total_value)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {confirmId === t.id ? (
                    <span className="inline-flex gap-2">
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        className="text-coral text-xs underline underline-offset-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                      >
                        {deletingId === t.id ? "Deleting…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-mist text-xs underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setError(null);
                        setConfirmId(t.id);
                      }}
                      className="text-mist hover:text-coral text-xs underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
