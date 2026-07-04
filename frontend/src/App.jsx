import { useCallback, useEffect, useState } from "react";
import TradeForm from "./components/TradeForm.jsx";
import Dashboard from "./components/Dashboard.jsx";
import History from "./components/History.jsx";
import Comparison from "./components/Comparison.jsx";

/**
 * Unified Stock Portfolio Tracker
 *
 * Three views on the right-hand side:
 *  - Holdings:  aggregated dashboard, filterable by account tab
 *  - Compare:   side-by-side allocation across all three accounts
 *  - History:   full trade log with delete, filterable by account tab
 *
 * All data entry is manual via the TradeForm; saving or deleting a trade
 * triggers `refresh` so every view stays in sync.
 */
export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [activeAccount, setActiveAccount] = useState(null); // null = all
  const [view, setView] = useState("holdings"); // holdings | compare | history
  const [portfolio, setPortfolio] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Load the account list once, on mount.
  useEffect(() => {
    fetch("/api/accounts")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load accounts");
        return res.json();
      })
      .then(setAccounts)
      .catch((err) => setError(err.message));
  }, []);

  // (Re)load data whenever the tab, view, or data version changes.
  useEffect(() => {
    const getJson = (url) =>
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${url}`);
        return res.json();
      });

    setLoading(true);
    setError(null);

    const accountQuery =
      activeAccount === null ? "" : `?account_id=${activeAccount}`;
    const portfolioUrl =
      activeAccount === null
        ? "/api/portfolio"
        : `/api/portfolio/${activeAccount}`;

    Promise.all([
      getJson(portfolioUrl),
      getJson("/api/portfolio-comparison"),
      getJson(`/api/transactions${accountQuery}`),
    ])
      .then(([p, c, t]) => {
        setPortfolio(p);
        setComparison(c);
        setTransactions(t);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeAccount, reloadKey]);

  const accountTabs = [{ id: null, name: "All accounts" }, ...accounts];
  const views = [
    { id: "holdings", label: "Holdings" },
    { id: "compare", label: "Compare accounts" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-5 flex items-baseline justify-between">
          <h1 className="font-display text-xl font-bold tracking-tight">
            Portfolio Ledger
          </h1>
          <span className="font-mono text-xs text-mist">
            manual entry · {accounts.length} accounts
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 grid gap-8 lg:grid-cols-[340px_1fr]">
        {/* Left column: trade entry */}
        <TradeForm accounts={accounts} onSaved={refresh} />

        {/* Right column: views */}
        <section>
          {/* View switcher */}
          <nav
            className="flex gap-1 mb-4 border-b border-line"
            aria-label="View"
          >
            {views.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`px-4 py-2 font-display text-sm font-medium border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                  view === v.id
                    ? "border-gold text-paper"
                    : "border-transparent text-mist hover:text-paper"
                }`}
              >
                {v.label}
              </button>
            ))}
          </nav>

          {/* Account tabs (not relevant in compare view, which is per-account by design) */}
          {view !== "compare" && (
            <nav
              className="flex flex-wrap gap-2 mb-6"
              aria-label="Account filter"
            >
              {accountTabs.map((tab) => {
                const active = (tab.id ?? null) === activeAccount;
                return (
                  <button
                    key={tab.id ?? "all"}
                    onClick={() => setActiveAccount(tab.id ?? null)}
                    className={`px-4 py-2 rounded-full font-mono text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                      active
                        ? "bg-paper text-ink font-medium"
                        : "bg-panel text-mist hover:text-paper border border-line"
                    }`}
                  >
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          )}

          {error && (
            <div className="rounded-lg border border-coral/50 bg-coral/10 text-coral px-4 py-3 mb-6 text-sm">
              {error} — check that the backend is running on port 8000.
            </div>
          )}

          {loading && !portfolio ? (
            <p className="text-mist font-mono text-sm">Loading…</p>
          ) : (
            <>
              {view === "holdings" && portfolio && (
                <Dashboard portfolio={portfolio} />
              )}
              {view === "compare" && comparison && (
                <Comparison comparison={comparison} />
              )}
              {view === "history" && (
                <History transactions={transactions} onChanged={refresh} />
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
