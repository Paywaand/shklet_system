/**
 * Clear SALES data only — walk-in Orders and delivery-platform orders.
 *
 * Deletes ONLY these four tables:
 *   - Order / OrderItem            (walk-in & branch sales)
 *   - DeliveryOrder / DeliveryOrderItem (delivery sales)
 *
 * Leaves everything else untouched: inventory (InventoryItem, StockMovement,
 * InventoryCategory), production (Recipe, RecipeIngredient),
 * menu, events, expenses, staff, roles and audit logs.
 *
 * Run:  npx tsx prisma/clear-sales.ts
 * It targets whatever DATABASE_URL points at, so double-check that first.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = {
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    deliveryOrders: await prisma.deliveryOrder.count(),
    deliveryOrderItems: await prisma.deliveryOrderItem.count(),
  };

  console.log("About to delete SALES data only:");
  console.table(before);

  // Child rows first, then parents — works whether or not cascade is on.
  // Everything in one transaction so it's all-or-nothing.
  await prisma.$transaction([
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.deliveryOrderItem.deleteMany(),
    prisma.deliveryOrder.deleteMany(),
  ]);

  // Sanity check: prove the kept tables are still intact.
  const kept = {
    inventoryItems: await prisma.inventoryItem.count(),
    stockMovements: await prisma.stockMovement.count(),
    recipes: await prisma.recipe.count(),
    menuItems: await prisma.menuItem.count(),
    events: await prisma.event.count(),
    expenses: await prisma.expense.count(),
  };

  console.log("\n✅ Sales data cleared. Untouched (should be non-zero where you had data):");
  console.table(kept);
}

main()
  .catch((e) => {
    console.error("❌ Failed — nothing was deleted (transaction rolled back):", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
