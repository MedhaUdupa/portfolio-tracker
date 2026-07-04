import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ACCOUNT_COLORS = ["#E3B455", "#4FD1A5", "#7FA8E3", "#F27E7E", "#B08FE0"];

const currency = (n) =>
  n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

/**
 * Per-account allocation comparison.
 *
 * `comparison` comes from GET /api/portfolio-comparison:
 * { accounts: [PortfolioOut, ...], grand_total }
 *
 * Renders one summary card per account plus a grouped bar chart where each
 * asset gets one bar per account, so overlap and concentration across
 * brokerages is visible at a glance.
 */
export default function Comparison({ comparison }) {
  const { accounts, grand_total } = comparison;

  // Pivot: one row per ticker, one keyed column per account.
  const tickers = [
    ...new Set(
      accounts.flatMap((a) => a.holdings.map((h) => h.ticker_symbol))
    ),
  ];
  const chartData = tickers
    .map((ticker) => {
      const row = { ticker };
      for (const a of accounts) {
        const holding = a.holdings.find((h) => h.ticker_symbol === ticker);
        row[a.account_name] = holding ? (holding.current_value !== null ? holding.current_value : holding.invested_amount) : 0;
      }
      row.__total = accounts.reduce((s, a) => s + (row[a.account_name] || 0), 0);
      return row;
    })
    .sort((x, y) => y.__total - x.__total);

  const hasData = tickers.length > 0;

  const grand_total_current_value = accounts.reduce((acc, a) => acc + a.holdings.reduce((sum, h) => sum + (h.current_value !== null ? h.current_value : h.invested_amount), 0), 0);

  return (
    <div className="space-y-6">
      {/* One card per account */}
      <div className="grid gap-4 sm:grid-cols-3">
        {accounts.map((a, i) => {
          const total_current_value = a.holdings.reduce((sum, h) => sum + (h.current_value !== null ? h.current_value : h.invested_amount), 0);
          const total_pnl = total_current_value - a.total_invested;
          const total_pnl_pct = a.total_invested > 0 ? (total_pnl / a.total_invested) * 100 : 0;
          const share =
            grand_total_current_value > 0 ? (total_current_value / grand_total_current_value) * 100 : 0;
          return (
            <div
              key={a.account_id}
              className="bg-panel border border-line rounded-xl p-5"
              style={{ borderTopColor: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length], borderTopWidth: 3 }}
            >
              <p className="font-mono text-xs text-mist uppercase tracking-widest mb-1">
                {a.account_name}
              </p>
              <p className="font-display text-2xl font-bold tabular-nums">
                {currency(total_current_value)}
              </p>
              <p className={`font-mono text-xs mt-1 ${total_pnl > 0 ? 'text-mint' : total_pnl < 0 ? 'text-coral' : 'text-mist'}`}>
                {total_pnl > 0 ? '+' : ''}{currency(total_pnl)} ({total_pnl_pct > 0 ? '+' : ''}{total_pnl_pct.toFixed(2)}%)
              </p>
              <p className="font-mono text-xs text-mist mt-1">
                {share.toFixed(1)}% of portfolio
              </p>
            </div>
          );
        })}
      </div>

      {!hasData ? (
        <div className="bg-panel border border-dashed border-line rounded-xl p-10 text-center">
          <p className="font-display font-bold mb-1">Nothing to compare yet</p>
          <p className="text-mist text-sm">
            Log trades in at least one account to see the side-by-side view.
          </p>
        </div>
      ) : (
        <div className="bg-panel border border-line rounded-xl p-6">
          <h3 className="font-display font-bold mb-4">
            Invested per asset, by account
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid stroke="#2A323B" vertical={false} />
                <XAxis
                  dataKey="ticker"
                  stroke="#8B98A5"
                  tick={{ fontFamily: "IBM Plex Mono", fontSize: 12 }}
                />
                <YAxis
                  stroke="#8B98A5"
                  tick={{ fontFamily: "IBM Plex Mono", fontSize: 12 }}
                  tickFormatter={(v) => `$${v.toLocaleString()}`}
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{
                    background: "#101418",
                    border: "1px solid #2A323B",
                    borderRadius: 8,
                    fontFamily: "IBM Plex Mono",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [currency(value), name]}
                />
                <Legend
                  wrapperStyle={{ fontFamily: "IBM Plex Mono", fontSize: 12 }}
                />
                {accounts.map((a, i) => (
                  <Bar
                    key={a.account_id}
                    dataKey={a.account_name}
                    fill={ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
