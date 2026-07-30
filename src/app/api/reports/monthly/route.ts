import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { withApiError } from "@/lib/api";
import { formatMoney } from "@/lib/money";

/** Branded, print-to-PDF-friendly monthly report (module 15). */
export const GET = withApiError(async (req: NextRequest) => {
  await requireRole("ADMIN");
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7); // YYYY-MM

  const [year, monthNum] = month.split("-").map(Number);
  const from = new Date(year, monthNum - 1, 1);
  const to = new Date(year, monthNum, 1);

  const [orders, expenses] = await Promise.all([
    prisma.order.findMany({
      where: { placedAt: { gte: from, lt: to }, type: "WALKIN", status: { not: "CANCELLED" } },
      include: { items: true },
    }),
    prisma.expense.aggregate({ where: { date: { gte: from, lt: to } }, _sum: { amount: true } }),
  ]);

  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const expensesTotal = expenses._sum.amount ?? 0;

  const itemCounts = new Map<string, number>();
  const prepTimes: number[] = [];
  for (const o of orders) {
    for (const item of o.items) itemCounts.set(item.nameSnapshot, (itemCounts.get(item.nameSnapshot) ?? 0) + item.quantity);
    if (o.readyAt) prepTimes.push((new Date(o.readyAt).getTime() - new Date(o.placedAt).getTime()) / 60000);
  }
  const topItems = [...itemCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const avgPrep = prepTimes.length > 0 ? Math.round(prepTimes.reduce((s, t) => s + t, 0) / prepTimes.length) : 0;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Shklet Monthly Report — ${month}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #232222; padding: 40px; max-width: 800px; margin: 0 auto; }
  h1 { color: #EF3340; }
  .stat { display: inline-block; width: 45%; margin: 10px 2.5%; padding: 16px; border: 1px solid #e7ddd0; border-radius: 12px; }
  .stat .label { font-size: 12px; color: #8a8178; }
  .stat .value { font-size: 22px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e7ddd0; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Shklet — Monthly Report</h1>
  <p>${month}</p>
  <div class="stat"><div class="label">Revenue</div><div class="value">${formatMoney(revenue)}</div></div>
  <div class="stat"><div class="label">Expenses</div><div class="value">${formatMoney(expensesTotal)}</div></div>
  <div class="stat"><div class="label">Gross Profit</div><div class="value">${formatMoney(revenue - expensesTotal)}</div></div>
  <div class="stat"><div class="label">Avg Prep Time</div><div class="value">${avgPrep} min</div></div>
  <h3>Top Items</h3>
  <table>
    <tr><th>Item</th><th>Qty Sold</th></tr>
    ${topItems.map(([name, qty]) => `<tr><td>${name}</td><td>${qty}</td></tr>`).join("")}
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
});
