import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize, audit } from "@/lib/guard";
import { activeBranch } from "@/lib/branchScope";

export async function POST(req: Request) {
  const guard = await authorize("menu.manage");
  if (!guard.ok) return guard.response;
  const branch = await activeBranch(guard.session);

  const { name } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const count = await prisma.category.count({ where: { branch } });
  const category = await prisma.category.create({
    data: { name: name.trim(), branch, sortOrder: count },
  });
  await audit(guard.session.sub, `Created category "${category.name}" (${branch})`);
  return NextResponse.json({ category }, { status: 201 });
}
