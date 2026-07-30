import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { getDeliverySettings } from "@/lib/delivery";

// GET /api/delivery/settings — the active branch's delivery-platform config.
// Available to any signed-in user (the POS needs the platform name + accent
// color to label the delivery button); the commission % is only actionable
// server-side, so exposing it here is harmless for cashiers.
export async function GET() {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const settings = await getDeliverySettings(branch);
  return NextResponse.json({ settings });
}

// PATCH /api/delivery/settings { platformName?, commissionPct?, color? }
// ADMIN-ONLY: changes the active branch's platform name / commission %.
// Existing orders keep their snapshotted values — only future orders use the
// new percentage.
export async function PATCH(req: Request) {
  const guard = await authorize();
  if (!guard.ok) return guard.response;
  if (guard.session.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const branch = await activeBranch(guard.session);
  await getDeliverySettings(branch); // ensure the row exists

  const body = await req.json().catch(() => ({}));
  const data: { platformName?: string; commissionPct?: number; color?: string } = {};

  if (body.platformName !== undefined) {
    const name = String(body.platformName).trim();
    if (!name) return NextResponse.json({ error: "Platform name is required" }, { status: 400 });
    data.platformName = name.slice(0, 40);
  }
  if (body.commissionPct !== undefined) {
    const pct = Number(body.commissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100)
      return NextResponse.json({ error: "Commission must be between 0 and 100" }, { status: 400 });
    data.commissionPct = pct;
  }
  if (body.color !== undefined) {
    const color = String(body.color).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color))
      return NextResponse.json({ error: "Color must be a hex value like #0fb79b" }, { status: 400 });
    data.color = color;
  }

  const updated = await prisma.deliverySettings.update({ where: { branch }, data });
  await audit(
    guard.session.sub,
    `Updated delivery settings for ${branch}: ${updated.platformName} @ ${updated.commissionPct}%`
  );
  return NextResponse.json({
    settings: {
      branch,
      platformName: updated.platformName,
      commissionPct: updated.commissionPct,
      color: updated.color,
    },
  });
}
