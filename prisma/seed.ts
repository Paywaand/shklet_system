import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Shklet database…");

  // ── Cities ────────────────────────────────────────────────────────────
  const suly = await prisma.city.upsert({
    where: { slug: "sulaymaniyah" },
    update: {},
    create: { slug: "sulaymaniyah", name: "Sulaymaniyah", nameKu: "سلێمانی" },
  });
  const erbil = await prisma.city.upsert({
    where: { slug: "erbil" },
    update: {},
    create: { slug: "erbil", name: "Erbil", nameKu: "هەولێر" },
  });

  // ── Branches: Sulaymaniyah x2, Erbil x1 ─────────────────────────────────
  const existingBranches = await prisma.branch.findMany();
  let sulyBranch1 = existingBranches.find((b) => b.name === "Branch 1" && b.cityId === suly.id);
  if (!sulyBranch1) {
    sulyBranch1 = await prisma.branch.create({
      data: { cityId: suly.id, name: "Branch 1", nameKu: "لقی 1" },
    });
  }
  let sulyBranch2 = existingBranches.find((b) => b.name === "Branch 2" && b.cityId === suly.id);
  if (!sulyBranch2) {
    sulyBranch2 = await prisma.branch.create({
      data: { cityId: suly.id, name: "Branch 2", nameKu: "لقی 2" },
    });
  }
  let erbilBranch = existingBranches.find((b) => b.cityId === erbil.id);
  if (!erbilBranch) {
    erbilBranch = await prisma.branch.create({
      data: { cityId: erbil.id, name: "Main Branch", nameKu: "لقی سەرەکی" },
    });
  }

  // ── App settings (business hours) ──────────────────────────────────────
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, openingHour: 10, closingHour: 1 }, // open 10:00, close 01:00
  });

  // ── Staff ────────────────────────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash("Shklet@2026", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminPasswordHash,
      fullName: "Admin",
      role: "ADMIN",
    },
  });

  const managerPasswordHash = await bcrypt.hash("Manager@2026", 10);
  await prisma.user.upsert({
    where: { username: "suly.manager" },
    update: {},
    create: {
      username: "suly.manager",
      passwordHash: managerPasswordHash,
      fullName: "Sulaymaniyah Manager",
      role: "MANAGER",
      cityId: suly.id,
    },
  });

  const cashierPasswordHash = await bcrypt.hash("Cashier@2026", 10);
  await prisma.user.upsert({
    where: { username: "suly.cashier1" },
    update: {},
    create: {
      username: "suly.cashier1",
      passwordHash: cashierPasswordHash,
      fullName: "Sulaymaniyah Branch 1 Cashier",
      role: "CASHIER",
      branchId: sulyBranch1.id,
    },
  });

  // ── Menu: Categories + items + per-city pricing ─────────────────────────
  // Sourced verbatim from shklet_menu_seed.md.
  type SeedItem = {
    name: string;
    nameKu: string;
    sulyPrice: number | null;
    erbilPrice: number | null;
  };
  type SeedCategory = { name: string; nameKu: string; items: SeedItem[] };

  const categories: SeedCategory[] = [
    {
      name: "Cups",
      nameKu: "کاپەکان",
      items: [
        { name: "Dubai Special", nameKu: "دوبەی سپێشەڵ", sulyPrice: 6000, erbilPrice: 6000 },
        { name: "Mini Pancakes", nameKu: "مینی پانکەیک", sulyPrice: 5000, erbilPrice: 5000 },
        { name: "Maqluba", nameKu: "مەقلوبە", sulyPrice: 9000, erbilPrice: 11000 },
        { name: "Shklet Special", nameKu: "سپێشەڵی شکلێت", sulyPrice: 5000, erbilPrice: 5000 },
        { name: "Fruit Chocolate", nameKu: "میوە بە چۆکلەیت", sulyPrice: 5000, erbilPrice: null },
      ],
    },
    {
      name: "Drinks",
      nameKu: "خواردنەوەکان",
      items: [
        { name: "Breeze", nameKu: "شکلێت بریز", sulyPrice: 5000, erbilPrice: 5000 },
        { name: "Midnight", nameKu: "میدنایت", sulyPrice: 5000, erbilPrice: 5000 },
      ],
    },
    {
      name: "Baked Goods",
      nameKu: "شیرینی برژاو",
      items: [
        { name: "Cookies", nameKu: "کووکی بچووک", sulyPrice: 5500, erbilPrice: 6500 },
        { name: "Tiramisu", nameKu: "ترامیسو", sulyPrice: 5000, erbilPrice: 6000 },
        { name: "Brownie", nameKu: "براونی", sulyPrice: 6500, erbilPrice: null },
        { name: "Brookie", nameKu: "بروکی", sulyPrice: 6000, erbilPrice: null },
      ],
    },
    {
      name: "Ice Cream",
      nameKu: "ئایس کرێم",
      items: [
        { name: "Peach", nameKu: "قۆخ", sulyPrice: 3500, erbilPrice: 4000 },
        { name: "Strawberry", nameKu: "شلیک", sulyPrice: 3500, erbilPrice: 4000 },
        { name: "Pistachio", nameKu: "فستق", sulyPrice: 4000, erbilPrice: 4500 },
        { name: "Cookies and Ice Cream", nameKu: "کووکی و ئایس کرێم", sulyPrice: 5500, erbilPrice: 6000 },
        { name: "Ice Cream Special", nameKu: "ئایس کرێم سپێشەڵ", sulyPrice: 5500, erbilPrice: 6000 },
      ],
    },
    {
      name: "Extras",
      nameKu: "زیادەکان",
      items: [
        { name: "Extra Chocolate", nameKu: "چۆکلەیتی زیاده", sulyPrice: 1500, erbilPrice: 1500 },
      ],
    },
  ];

  let categorySort = 0;
  for (const cat of categories) {
    const category = await prisma.category.upsert({
      where: { id: `seed-cat-${cat.name.toLowerCase().replace(/\s+/g, "-")}` },
      update: {},
      create: {
        id: `seed-cat-${cat.name.toLowerCase().replace(/\s+/g, "-")}`,
        name: cat.name,
        nameKu: cat.nameKu,
        sortOrder: categorySort++,
      },
    });

    let itemSort = 0;
    for (const item of cat.items) {
      const basePrice = item.sulyPrice ?? item.erbilPrice ?? 0;
      const menuItem = await prisma.menuItem.upsert({
        where: { id: `seed-item-${category.id}-${item.name.toLowerCase().replace(/\s+/g, "-")}` },
        update: {},
        create: {
          id: `seed-item-${category.id}-${item.name.toLowerCase().replace(/\s+/g, "-")}`,
          categoryId: category.id,
          name: item.name,
          nameKu: item.nameKu,
          basePrice,
          sortOrder: itemSort++,
        },
      });

      if (item.sulyPrice !== null) {
        await prisma.menuItemCityPrice.upsert({
          where: { menuItemId_cityId: { menuItemId: menuItem.id, cityId: suly.id } },
          update: { price: item.sulyPrice, available: true },
          create: { menuItemId: menuItem.id, cityId: suly.id, price: item.sulyPrice, available: true },
        });
      }
      if (item.erbilPrice !== null) {
        await prisma.menuItemCityPrice.upsert({
          where: { menuItemId_cityId: { menuItemId: menuItem.id, cityId: erbil.id } },
          update: { price: item.erbilPrice, available: true },
          create: { menuItemId: menuItem.id, cityId: erbil.id, price: item.erbilPrice, available: true },
        });
      } else {
        // Explicitly mark unavailable in Erbil so the POS never shows it there.
        await prisma.menuItemCityPrice.upsert({
          where: { menuItemId_cityId: { menuItemId: menuItem.id, cityId: erbil.id } },
          update: { available: false },
          create: {
            menuItemId: menuItem.id,
            cityId: erbil.id,
            price: item.sulyPrice ?? 0,
            available: false,
          },
        });
      }
    }
  }

  // ── Inventory categories (per city) ────────────────────────────────────
  const invCategoryDefs = [
    { name: "Drink Ingredients", nameKu: "پێکهاتەکانی خواردنەوە", color: "#249E6B" },
    { name: "Packaging", nameKu: "پاکەتبەندی", color: "#AA8066" },
    { name: "Cleaning", nameKu: "پاکژکردنەوە", color: "#CBA3D8" },
  ];
  for (const city of [suly, erbil]) {
    for (const def of invCategoryDefs) {
      const id = `seed-inv-cat-${city.slug}-${def.name.toLowerCase().replace(/\s+/g, "-")}`;
      await prisma.inventoryCategory.upsert({
        where: { id },
        update: {},
        create: { id, cityId: city.id, name: def.name, nameKu: def.nameKu, color: def.color },
      });
    }
  }

  console.log("Seed complete.");
  console.log("─────────────────────────────────────────");
  console.log("Default accounts (CHANGE THESE PASSWORDS):");
  console.log("  admin           / Shklet@2026   (ADMIN)");
  console.log("  suly.manager    / Manager@2026  (MANAGER — Sulaymaniyah)");
  console.log("  suly.cashier1   / Cashier@2026  (CASHIER — Sulaymaniyah Branch 1)");
  console.log("─────────────────────────────────────────");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
