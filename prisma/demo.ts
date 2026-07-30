// Demo data for screenshots / client walkthrough. Local use only.
// Run: npm run demo   (wipes + reseeds base data first via db:reset is recommended)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const SAUCE = JSON.stringify([
  { name: "Sauce", required: true, options: ["Sweet Sauce", "Sour Sauce", "Half & Half"] },
]);

function at(daysAgo: number, hour: number, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d;
}
const pick = <T>(arr: T[], i: number) => arr[i % arr.length];

async function main() {
  // ---- Extra staff with salaries ----
  const mk = async (username: string, fullName: string, role: string, salary: number) => {
    await prisma.user.upsert({
      where: { username },
      update: { fullName, role, salary, active: true },
      create: { username, fullName, role, salary, password: await bcrypt.hash("demo1234", 10) },
    });
  };
  await mk("sarah", "Sarah Ahmed", "manager", 900000);
  await mk("omar", "Omar Khalil", "cashier", 600000);
  await mk("lena", "Lena Yousif", "cashier", 600000);
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  const staffIds = (await prisma.user.findMany({ select: { id: true } })).map((s) => s.id);

  // ---- Drinks category to enrich the cashier grid ----
  let drinks = await prisma.category.findFirst({ where: { name: "Drinks" } });
  if (!drinks) {
    drinks = await prisma.category.create({ data: { name: "Drinks", sortOrder: 2 } });
    await prisma.menuItem.createMany({
      data: [
        { name: "Water", price: 1000, categoryId: drinks.id, sortOrder: 0 },
        { name: "Cola", price: 1500, categoryId: drinks.id, sortOrder: 1 },
        { name: "Fresh Lemonade", price: 2500, categoryId: drinks.id, sortOrder: 2 },
      ],
    });
  }
  const items = await prisma.menuItem.findMany();
  const byName = (n: string) => items.find((i) => i.name.includes(n))!;
  const SWEET = byName("Sweet Cheese");
  const EXTREME = byName("Extreme");
  const FLAMING = byName("Flaming");
  const RIBS6 = byName("6 pieces");
  const COLA = byName("Cola");
  const LEM = byName("Fresh Lemonade");

  // ---- Inventory deliveries (set unit costs) + a low-stock item ----
  const inv = await prisma.inventoryItem.findMany();
  const invByName = (n: string) => inv.find((i) => i.name === n);
  const deliver = async (name: string, qty: number, totalCost: number) => {
    const it = invByName(name);
    if (!it) return;
    const unit = totalCost / qty;
    await prisma.inventoryItem.update({
      where: { id: it.id },
      data: { quantity: it.quantity + qty, lastUnitCost: unit },
    });
    await prisma.stockMovement.create({
      data: { itemId: it.id, change: qty, reason: "delivery", unitCost: unit, totalCost, staffId: admin!.id, createdAt: at(6, 9) },
    });
  };
  await deliver("Sweet Corn", 50, 250000);
  await deliver("Cheese Powder", 10, 120000);
  await deliver("Butter", 12, 60000);
  await deliver("Sour Sauce", 8, 40000);
  await deliver("Sweet Sauce", 8, 44000);
  // usage deductions (with cost from lastUnitCost)
  const useStock = async (name: string, qty: number, reason: string, daysAgo: number, note?: string) => {
    const it = await prisma.inventoryItem.findFirst({ where: { name } });
    if (!it) return;
    const unit = it.lastUnitCost ?? null;
    await prisma.$transaction([
      prisma.inventoryItem.update({ where: { id: it.id }, data: { quantity: Math.max(0, it.quantity - qty) } }),
      prisma.stockMovement.create({
        data: { itemId: it.id, change: -qty, reason, note: note ?? null, unitCost: unit, totalCost: unit ? -unit * qty : null, staffId: admin!.id, createdAt: at(daysAgo, 18) },
      }),
    ]);
  };
  await useStock("Sweet Corn", 12, "daily_usage", 2);
  await useStock("Cheese Powder", 2, "daily_usage", 1);
  await useStock("Butter", 1.5, "wastage", 3, "Dropped a batch");
  // Make one item low-stock to show the alert
  const lowItem = invByName("Forks");
  if (lowItem) await prisma.inventoryItem.update({ where: { id: lowItem.id }, data: { quantity: 80, minThreshold: 150 } });

  // ---- Events ----
  const festival = await prisma.event.create({
    data: { name: "Erbil Food Festival", location: "Sami Abdulrahman Park", startDate: at(1, 10), status: "active" },
  });
  const market = await prisma.event.create({
    data: { name: "Citadel Night Market", location: "Citadel Square", startDate: at(12, 16), endDate: at(10, 23), status: "closed", closedAt: at(9, 12) },
  });

  // ---- Branch orders (history for analytics) ----
  const menuPool = [SWEET, EXTREME, FLAMING, COLA, LEM, RIBS6];
  let n = 0;
  const makeOrder = async (daysAgo: number, hour: number, opts: { eventId?: string; status?: string } = {}) => {
    n++;
    const a = pick(menuPool, n);
    const b = pick(menuPool, n + 2);
    const qa = (n % 2) + 1;
    const lines = [
      { name: a.name, price: a.price, quantity: qa, modifier: a.name.includes("pieces") ? "Sweet Sauce" : null },
      { name: b.name, price: b.price, quantity: 1, modifier: null },
    ];
    const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const placedAt = at(daysAgo, hour, (n * 7) % 60);
    const status = opts.status ?? "collected";
    const dur = 120 + ((n * 37) % 480);
    await prisma.order.create({
      data: {
        pagerNumber: ((n * 3) % 30) + 1,
        total,
        paymentMethod: n % 5 === 0 ? "card" : "cash",
        status,
        placedAt,
        readyAt: status !== "pending" ? new Date(placedAt.getTime() + dur * 1000) : null,
        collectedAt: status === "collected" ? new Date(placedAt.getTime() + (dur + 90) * 1000) : null,
        durationSeconds: status !== "pending" ? dur : null,
        staffId: pick(staffIds, n),
        eventId: opts.eventId ?? null,
        items: { create: lines },
      },
    });
  };
  // spread across last 30 days, peak hours
  const hours = [11, 12, 13, 13, 14, 18, 19, 19, 20, 21];
  for (let d = 0; d < 30; d++) {
    const count = d < 7 ? 4 : 1; // denser recent week
    for (let k = 0; k < count; k++) await makeOrder(d, pick(hours, d + k));
  }
  // closed-event tagged orders
  for (let k = 0; k < 6; k++) await makeOrder(11, pick(hours, k), { eventId: market.id });
  // active orders right now (for the cashier queue)
  await makeOrder(0, new Date().getHours(), { status: "pending" });
  await makeOrder(0, new Date().getHours(), { status: "pending" });
  await makeOrder(0, new Date().getHours(), { status: "ready" });

  // closed-event usage + expenses (for evaluation)
  await useStock("Sweet Corn", 8, "daily_usage", 11);
  await prisma.stockMovement.updateMany({ where: { reason: "daily_usage", change: -8 }, data: { eventId: market.id } });
  await prisma.expense.create({ data: { category: "Supplies", description: "Festival stall rent", amount: 150000, date: at(11, 9), createdById: admin!.id, eventId: market.id } });
  await prisma.expense.create({ data: { category: "Staff", description: "Event helpers", amount: 80000, date: at(11, 9), createdById: admin!.id, eventId: market.id } });

  // ---- Branch expenses (this month) ----
  await prisma.expense.create({ data: { category: "Rent", description: "Monthly kiosk rent", amount: 1500000, date: at(20, 10), createdById: admin!.id } });
  await prisma.expense.create({ data: { category: "Utilities", description: "Electricity + water", amount: 250000, date: at(8, 10), createdById: admin!.id } });
  await prisma.expense.create({ data: { category: "Supplies", description: "Cups & forks restock", amount: 180000, date: at(4, 14), createdById: admin!.id } });

  // ---- Delivery-platform orders (Toters/Talabat) ----
  const makeDelivery = async (daysAgo: number, hour: number, status: string, ref: string) => {
    n++;
    const a = pick(menuPool, n);
    const lines = [{ name: a.name, price: a.price, quantity: (n % 2) + 1, modifier: null }];
    const gross = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const placedAt = at(daysAgo, hour, (n * 11) % 60);
    const prep = 150 + ((n * 23) % 300);
    const arrive = 120 + ((n * 17) % 240);
    await prisma.deliveryOrder.create({
      data: {
        branch: "suli",
        platformName: "Toters",
        commissionPct: 20,
        reference: ref,
        grossTotal: gross,
        netTotal: Math.round(gross * 0.8),
        status,
        placedAt,
        readyAt: status !== "pending" ? new Date(placedAt.getTime() + prep * 1000) : null,
        driverArrivedAt: status === "driver_arrived" || status === "collected" ? new Date(placedAt.getTime() + (prep + arrive) * 1000) : null,
        collectedAt: status === "collected" ? new Date(placedAt.getTime() + (prep + arrive + 60) * 1000) : null,
        prepSeconds: status !== "pending" ? prep : null,
        arriveSeconds: status === "driver_arrived" || status === "collected" ? arrive : null,
        staffId: pick(staffIds, n),
        items: { create: lines },
      },
    });
  };
  for (let d = 0; d < 25; d++) if (d % 2 === 0) await makeDelivery(d, pick(hours, d), "collected", `Toters #${4500 + d}`);
  await makeDelivery(0, new Date().getHours(), "pending", "Toters #4602");
  await makeDelivery(0, new Date().getHours(), "ready", "Toters #4603");

  const counts = {
    orders: await prisma.order.count(),
    delivery: await prisma.deliveryOrder.count(),
    expenses: await prisma.expense.count(),
    events: await prisma.event.count(),
    staff: await prisma.user.count(),
  };
  console.log("✓ Demo data loaded:", counts);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
