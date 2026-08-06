import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";
import { getDeliverySettings } from "@/lib/delivery";
import { generateUniqueDeliveryOrderShortId } from "@/lib/shortId";

// POST /api/delivery-orders — place a delivery-platform order (any cashier).
// The branch's platform name + commission % are snapshotted onto the order so
// later settings changes never rewrite history.
export async function POST(req: Request) {
  const guard = await authorize("pos.use");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);
  const settings = await getDeliverySettings(branch);

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0)
    return NextResponse.json({ error: "Add at least one item" }, { status: 400 });

  const lineItems = items.map(
    (i: { name: string; price: number; quantity: number; modifier?: string | null }) => ({
      name: String(i.name),
      price: Math.round(Number(i.price)),
      quantity: Math.max(1, Math.round(Number(i.quantity))),
      modifier: i.modifier ? String(i.modifier) : null,
    })
  );
  const grossTotal = lineItems.reduce(
    (s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity,
    0
  );
  const netTotal = Math.round(grossTotal * (1 - settings.commissionPct / 100));

  const shortId = await generateUniqueDeliveryOrderShortId(prisma);

  const order = await prisma.deliveryOrder.create({
    data: {
      shortId,
      branch,
      platformName: settings.platformName,
      commissionPct: settings.commissionPct,
      reference: body.reference?.trim() || null,
      grossTotal,
      netTotal,
      staffId: guard.session.sub,
      items: { create: lineItems },
    },
    include: { items: true },
  });

  await audit(
    guard.session.sub,
    `Placed ${settings.platformName} order (gross ${grossTotal} / net ${netTotal} IQD, ${branch})`
  );
  return NextResponse.json({ order }, { status: 201 });
}
