// One-time import of the real Shklet menu (from menu_items_rows-2.csv) into
// the Category/MenuItem tables. Idempotent: upserts by (name, branch), safe to
// re-run. No description/imageUrl/modifiers — English + Kurdish name only.
//   npm run import:menu
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Branch = "suli" | "erbil";

type Row = {
  name: string;
  nameKu: string;
  price: number;
  category: string;
  branches: Branch[];
};

const ROWS: Row[] = [
  { name: "Dubai Special", nameKu: "دوبەی سپێشەڵ", price: 6000, category: "Cups", branches: ["suli", "erbil"] },
  { name: "Mini Pancakes", nameKu: "مینی پانکەیک", price: 5000, category: "Cups", branches: ["suli"] },
  { name: "Mini Pancakes", nameKu: "مینی پانکەیک", price: 5000, category: "Cups", branches: ["erbil"] },
  { name: "Maqluba", nameKu: "مەقلوبە", price: 9500, category: "Cups", branches: ["suli"] },
  { name: "Maqluba", nameKu: "مەقلوبە", price: 11000, category: "Cups", branches: ["erbil"] },
  { name: "Shklet Special", nameKu: "سپێشەڵی شکلێت", price: 5000, category: "Cups", branches: ["suli"] },
  { name: "Shklet Special", nameKu: "سپێشەڵی شکلێت", price: 5000, category: "Cups", branches: ["erbil"] },
  { name: "Fruit Chocolate", nameKu: "میوە بە چۆکلەیت", price: 5000, category: "Cups", branches: ["suli"] },

  { name: "Breeze", nameKu: "شکلێت بریز", price: 5000, category: "Drinks", branches: ["suli", "erbil"] },
  { name: "Midnight", nameKu: "میدنایت", price: 5000, category: "Drinks", branches: ["suli", "erbil"] },

  { name: "Cookies", nameKu: "کووکی بچووک", price: 5500, category: "Baked Goods", branches: ["suli"] },
  { name: "Cookies", nameKu: "کووکی بچووک", price: 6500, category: "Baked Goods", branches: ["erbil"] },
  { name: "Tiramisu", nameKu: "ترامیسو", price: 5000, category: "Baked Goods", branches: ["suli"] },
  { name: "Tiramisu", nameKu: "ترامیسو", price: 6000, category: "Baked Goods", branches: ["erbil"] },

  { name: "Extra Chocolate", nameKu: "چۆکلەیتی زیاده", price: 1500, category: "Extras", branches: ["suli", "erbil"] },

  { name: "Peach", nameKu: "قۆخ", price: 3500, category: "Ice Cream", branches: ["suli"] },
  { name: "Peach", nameKu: "قۆخ", price: 4000, category: "Ice Cream", branches: ["erbil"] },
  { name: "Strawberry", nameKu: "شلیک", price: 3500, category: "Ice Cream", branches: ["suli"] },
  { name: "Strawberry", nameKu: "شلیک", price: 4000, category: "Ice Cream", branches: ["erbil"] },
  { name: "Pistachio", nameKu: "فستق", price: 4000, category: "Ice Cream", branches: ["suli"] },
  { name: "Pistachio", nameKu: "فستق", price: 4500, category: "Ice Cream", branches: ["erbil"] },
  { name: "Cookies and Ice Cream", nameKu: "کووکی و ئایس کرێم", price: 5500, category: "Ice Cream", branches: ["suli"] },
  { name: "Cookies and Ice Cream", nameKu: "کووکی و ئایس کرێم", price: 6000, category: "Ice Cream", branches: ["erbil"] },
  { name: "Ice Cream Special", nameKu: "ئایس کرێم سپێشەڵ", price: 5500, category: "Ice Cream", branches: ["suli"] },
  { name: "Ice Cream Special", nameKu: "ئایس کرێم سپێشەڵ", price: 6000, category: "Ice Cream", branches: ["erbil"] },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const branch of ["suli", "erbil"] as Branch[]) {
    const categoryNames = [...new Set(ROWS.filter((r) => r.branches.includes(branch)).map((r) => r.category))];
    const categoryIds = new Map<string, string>();

    for (const name of categoryNames) {
      let cat = await prisma.category.findFirst({ where: { name, branch } });
      if (!cat) {
        const count = await prisma.category.count({ where: { branch } });
        cat = await prisma.category.create({ data: { name, branch, sortOrder: count } });
      }
      categoryIds.set(name, cat.id);
    }

    for (const row of ROWS.filter((r) => r.branches.includes(branch))) {
      const categoryId = categoryIds.get(row.category)!;
      const existing = await prisma.menuItem.findFirst({ where: { name: row.name, categoryId } });
      if (existing) {
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: { nameKu: row.nameKu, price: row.price },
        });
        updated++;
      } else {
        const count = await prisma.menuItem.count({ where: { categoryId } });
        await prisma.menuItem.create({
          data: {
            name: row.name,
            nameKu: row.nameKu,
            price: row.price,
            categoryId,
            sortOrder: count,
          },
        });
        created++;
      }
    }
  }

  console.log(`✓ Menu import done — ${created} created, ${updated} updated`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
