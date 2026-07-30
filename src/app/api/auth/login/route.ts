import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession } from "@/lib/auth";
import { checkRateLimit, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit";
import { withApiError, safeJson } from "@/lib/api";

interface LoginBody {
  username: string;
  password: string;
}

export const POST = withApiError(async (req: NextRequest) => {
  const body = await safeJson<LoginBody>(req);
  const username = (body.username ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  const rate = checkRateLimit(username);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "TOO_MANY_ATTEMPTS", retryAfterMinutes: rate.retryAfterMinutes },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    recordFailedAttempt(username);
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  clearAttempts(username);
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      cityId: user.cityId,
      branchId: user.branchId,
    },
  });
});
