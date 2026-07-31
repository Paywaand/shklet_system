import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_GRANTS, PERMISSIONS, ROLES } from "../src/lib/permissions";
import { DEFAULT_INVENTORY_CATEGORIES } from "../src/lib/categories";
import { BRANCHES, DEFAULT_DELIVERY } from "../src/lib/branches";
import { generateUniqueOrderShortId } from "../src/lib/shortId";

const prisma = new PrismaClient();

// Starter menu — one identical set per branch (each branch manages its own menu
// afterwards; nothing is shared between Suli and Erbil).
const MENU: {
  category: string;
  items: { name: string; price: number; description?: string; modifiers?: string }[];
}[] = [
  {
    category: "Snacks",
    items: [
      { name: "Classic", price: 3500, description: "Best seller" },
      { name: "Special", price: 4500 },
    ],
  },
];

// Starter warehouse items per branch.
const INVENTORY: { name: string; unit: string; quantity: number; minThreshold: number }[] = [
  { name: "Flour", unit: "kg", quantity: 40, minThreshold: 10 },
  { name: "Cheese", unit: "kg", quantity: 8, minThreshold: 3 },
  { name: "Butter", unit: "kg", quantity: 6, minThreshold: 2 },
  { name: "Paper Boxes", unit: "piece", quantity: 500, minThreshold: 100 },
  { name: "Forks", unit: "piece", quantity: 600, minThreshold: 150 },
  { name: "Salt", unit: "kg", quantity: 4, minThreshold: 1 },
];

async function main() {
  // --- Default super admin account (branchId = null → all branches) ---
  // SECURITY: only create the admin when it's missing (first boot / empty DB). We
  // never touch an existing admin's password, so a password changed in the app
  // survives every redeploy. Do NOT change this to overwrite the password on update.
  const existingAdmin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        username: "admin",
        password: await bcrypt.hash("admin123", 10),
        fullName: "Administrator",
        role: "admin",
        branchId: null, // super admin — sees/switches all branches
      },
    });
    console.log("✓ Created default super admin (admin / admin123) — change this after first login");
  } else {
    console.log("• Admin account already exists — password left unchanged");
  }

  // --- Physical branches (idempotent — upsert by name+city) ---
  const PHYSICAL_BRANCHES = [
    { name: "60 Street", city: "suli", sortOrder: 0 },
    { name: "Dania Trade Center", city: "suli", sortOrder: 1 },
    { name: "Erbil", city: "erbil", sortOrder: 0 },
  ];
  for (const b of PHYSICAL_BRANCHES) {
    const existing = await prisma.branch.findFirst({ where: { name: b.name, city: b.city } });
    if (!existing) await prisma.branch.create({ data: b });
  }
  console.log("✓ Seeded physical branches (60 Street, Dania Trade Center, Erbil)");

  // --- Role permissions matrix ---
  for (const role of ROLES) {
    for (const perm of PERMISSIONS) {
      const allowed = DEFAULT_GRANTS[role].includes(perm.key);
      await prisma.rolePermission.upsert({
        where: { role_key: { role, key: perm.key } },
        update: {},
        create: { role, key: perm.key, allowed },
      });
    }
  }
  console.log("✓ Seeded role permissions matrix");

  // --- Delivery platform settings (per branch) ---
  // Suli → Toters (20%), Erbil → Talabat. Admin-editable from the Delivery page;
  // upsert with empty update so admin changes survive redeploys.
  for (const branch of BRANCHES) {
    const def = DEFAULT_DELIVERY[branch];
    await prisma.deliverySettings.upsert({
      where: { branch },
      update: {},
      create: { branch, ...def },
    });
  }
  console.log("✓ Seeded delivery settings (Suli → Toters, Erbil → Talabat)");

  // --- Per-branch starter data ---
  for (const branch of BRANCHES) {
    // Menu
    const existingCats = await prisma.category.count({ where: { branch } });
    if (existingCats === 0) {
      for (let c = 0; c < MENU.length; c++) {
        const cat = await prisma.category.create({
          data: { name: MENU[c].category, branch, sortOrder: c },
        });
        for (let i = 0; i < MENU[c].items.length; i++) {
          const it = MENU[c].items[i];
          await prisma.menuItem.create({
            data: {
              name: it.name,
              price: it.price,
              description: it.description,
              modifiers: it.modifiers ?? null,
              categoryId: cat.id,
              sortOrder: i,
            },
          });
        }
      }
      console.log(`✓ Seeded starter menu (${branch})`);
    } else {
      console.log(`• Menu already present (${branch}) — skipped`);
    }

    // Inventory
    const existingInv = await prisma.inventoryItem.count({ where: { branch } });
    if (existingInv === 0) {
      for (const item of INVENTORY) {
        await prisma.inventoryItem.create({ data: { ...item, branch } });
      }
      console.log(`✓ Seeded inventory (${branch})`);
    } else {
      console.log(`• Inventory already present (${branch}) — skipped`);
    }

    // Inventory categories — idempotent: only create defaults the first time;
    // never touch admin-renamed ones.
    const existingCatCount = await prisma.inventoryCategory.count({ where: { branch } });
    if (existingCatCount === 0) {
      for (let i = 0; i < DEFAULT_INVENTORY_CATEGORIES.length; i++) {
        const c = DEFAULT_INVENTORY_CATEGORIES[i];
        await prisma.inventoryCategory.create({
          data: { name: c.name, branch, color: c.color, sortOrder: i },
        });
      }
      console.log(`✓ Seeded inventory categories (${branch})`);
    } else {
      console.log(`• Inventory categories already present (${branch}) — skipped`);
    }
  }

  // Backfill: give any pre-existing order a unique human-facing shortId.
  const ordersMissingShortId = await prisma.order.findMany({
    where: { shortId: null },
    select: { id: true },
  });
  for (const o of ordersMissingShortId) {
    const shortId = await generateUniqueOrderShortId(prisma);
    await prisma.order.update({ where: { id: o.id }, data: { shortId } });
  }
  if (ordersMissingShortId.length)
    console.log(`✓ Assigned shortId to ${ordersMissingShortId.length} order(s)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
