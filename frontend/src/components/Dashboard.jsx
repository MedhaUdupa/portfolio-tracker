import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const BAR_COLORS = ["#E3B455", "#4FD1A5", "#7FA8E3", "#F27E7E", "#B08FE0", "#8B98A5"];

const currency = (n) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

/**
 * Dashboard for a portfolio payload:
 * { account_id, account_name, total_invested, holdings: [...] }
 *
 * Shows a total-invested summary card, a Recharts bar chart of the amount
 * invested per asset, and a breakdown table of individual holdings.
 */
export default function Dashboard({ portfolio }) {
  const { account_name, total_invested, holdings } = portfolio;

  const chartData = holdings.map((h) => ({
    ticker: h.ticker_symbol,
    invested: h.invested_amount,
  }));

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="bg-panel border border-line rounded-xl p-6">
        <p className="font-mono text-xs text-mist uppercase tracking-widest mb-1">
          Total invested — {account_name}
        </p>
        <p className="font-display text-4xl font-bold tabular-nums">
          {currency(total_invested)}
        </p>
        <p className="font-mono text-xs text-mist mt-2">
          {holdings.length} open position{holdings.length === 1 ? "" : "s"} ·
          cost basis, weighted average method
        </p>
      </div>

      {holdings.length === 0 ? (
        <div className="bg-panel border border-dashed border-line rounded-xl p-10 text-center">
          <p className="font-display font-bold mb-1">No holdings yet</p>
          <p className="text-mist text-sm">
            Log your first trade with the form to start tracking this view.
          </p>
        </div>
      ) : (
        <>
          {/* Allocation chart */}
          <div className="bg-panel border border-line rounded-xl p-6">
            <h3 className="font-display font-bold mb-4">Invested per asset</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
                    formatter={(value) => [currency(value), "Invested"]}
                  />
                  <Bar dataKey="invested" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Holdings table */}
          <div className="bg-panel border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-xs text-mist uppercase tracking-wider">
                  <th className="px-5 py-3">Asset</th>
                  <th className="px-5 py-3 text-right">Quantity</th>
                  <th className="px-5 py-3 text-right">Avg buy price</th>
                  <th className="px-5 py-3 text-right">Invested</th>
                  <th className="px-5 py-3 text-right">Weight</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {holdings.map((h) => (
                  <tr
                    key={h.ticker_symbol}
                    className="border-b border-line/50 last:border-0 hover:bg-ink/40"
                  >
                    <td className="px-5 py-3 font-medium text-gold">
                      {h.ticker_symbol}
                    </td>
                    <td className="px-5 py-3 text-right">{h.total_quantity}</td>
                    <td className="px-5 py-3 text-right">
                      {currency(h.average_buy_price)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {currency(h.invested_amount)}
                    </td>
                    <td className="px-5 py-3 text-right text-mist">
                      {total_invested > 0
                        ? ((h.invested_amount / total_invested) * 100).toFixed(1)
                        : "0.0"}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
