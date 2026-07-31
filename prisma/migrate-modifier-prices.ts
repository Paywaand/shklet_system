// One-time migration: MenuItem.modifiers used to store each option as a plain
// string (["Sweet Sauce", "Sour Sauce"]); it's now {label, price}[] so options
// can carry a price delta. Rewrites every existing row's JSON in place, giving
// old plain-string options price: 0 (no behavior change until an admin edits
// prices in Menu Management). Idempotent — already-migrated rows (options
// already objects) are left untouched. Safe to re-run.
//   npm run migrate:modifier-prices
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type OldGroup = { name: string; required: boolean; options: string[] };
type NewGroup = { name: string; required: boolean; options: { label: string; price: number }[] };

function isAlreadyMigrated(groups: unknown): boolean {
  return (
    Array.isArray(groups) &&
    groups.every(
      (g) =>
        Array.isArray(g?.options) &&
        g.options.every((o: unknown) => typeof o === "object" && o !== null && "label" in o)
    )
  );
}

async function main() {
  const items = await prisma.menuItem.findMany({
    where: { modifiers: { not: null } },
    select: { id: true, name: true, modifiers: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const item of items) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(item.modifiers!);
    } catch {
      skipped++;
      continue;
    }

    if (isAlreadyMigrated(parsed)) {
      skipped++;
      continue;
    }

    const oldGroups = parsed as OldGroup[];
    const newGroups: NewGroup[] = oldGroups.map((g) => ({
      name: g.name,
      required: g.required,
      options: (g.options ?? []).map((label) => ({ label, price: 0 })),
    }));

    await prisma.menuItem.update({
      where: { id: item.id },
      data: { modifiers: JSON.stringify(newGroups) },
    });
    migrated++;
  }

  console.log(`✓ Modifier price migration done — ${migrated} migrated, ${skipped} already up to date`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
