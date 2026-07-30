// Per-branch delivery-platform settings (name + commission %). Server-only.
import { prisma } from "./prisma";
import { DEFAULT_DELIVERY, isBranch, type Branch } from "./branches";

export type DeliveryConfig = {
  branch: Branch;
  platformName: string;
  commissionPct: number;
  color: string;
};

// Read the settings row for a branch, creating it from the defaults on first
// use (Toters 20% in Suli, Talabat in Erbil — admin-editable afterwards).
export async function getDeliverySettings(branch: Branch): Promise<DeliveryConfig> {
  const row = await prisma.deliverySettings.findUnique({ where: { branch } });
  if (row) {
    return {
      branch,
      platformName: row.platformName,
      commissionPct: row.commissionPct,
      color: row.color,
    };
  }
  const def = DEFAULT_DELIVERY[branch];
  const created = await prisma.deliverySettings.upsert({
    where: { branch },
    update: {},
    create: { branch, ...def },
  });
  return {
    branch,
    platformName: created.platformName,
    commissionPct: created.commissionPct,
    color: created.color,
  };
}

export function assertBranch(v: unknown): Branch {
  if (!isBranch(v)) throw new Error("Invalid branch");
  return v;
}
