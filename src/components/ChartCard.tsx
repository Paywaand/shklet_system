// Shared chart wrapper — a titled card around a Recharts container. Used by
// the Sales page and the Dashboard.
export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}
