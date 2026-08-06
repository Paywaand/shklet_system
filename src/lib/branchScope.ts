// Server-side helper to resolve which branch/city a request operates on.
// - Branch-bound users (managers/cashiers) are HARD-SCOPED to their own city and
//   physical branch: whatever the client sends is ignored.
// - The super admin (session.branch = null) works on the city/branch selected in
//   the sidebar switcher (ACTIVE_BRANCH_COOKIE / ACTIVE_BRANCH_ID_COOKIE),
//   defaulting to Suli.
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { Session } from "./auth";
import { ACTIVE_BRANCH_COOKIE, ACTIVE_BRANCH_ID_COOKIE, BRANCHES, DEFAULT_BRANCH, isBranch, type Branch } from "./branches";

// City-level scope ("suli" | "erbil") — unchanged from before the physical-branch
// split, still used by every city-scoped model (Menu, Inventory, Expenses, Cash
// Tracking, Delivery, Daily Needs).
export async function activeBranch(session: Pick<Session, "branch">): Promise<Branch> {
  if (isBranch(session.branch)) return session.branch;
  const c = (await cookies()).get(ACTIVE_BRANCH_COOKIE)?.value;
  return isBranch(c) ? c : DEFAULT_BRANCH;
}

// "Combined" scope (admin-only): every city summed together, for the Sales and
// Dashboard pages' "All branches" view. Branch-bound staff can never combine —
// only the super admin (session.branch === null) may request it; anyone else
// silently falls back to their normal single-city scope.
export async function resolveBranchFilter(
  session: Pick<Session, "branch">,
  combinedRequested: boolean
): Promise<Branch | Branch[]> {
  if (combinedRequested && session.branch === null) return [...BRANCHES];
  return activeBranch(session);
}

// Physical-branch scope (Branch.id) — used by Staff, Orders, and Hours.
// Branch-bound staff are hard-scoped to session.branchId; the super admin reads
// the branch picker cookie, falling back to the current city's first active
// branch (sorted by sortOrder) if nothing is selected yet.
export async function activeBranchId(session: Pick<Session, "branch" | "branchId">): Promise<string> {
  if (session.branchId) return session.branchId;

  const city = await activeBranch(session);
  const cookieId = (await cookies()).get(ACTIVE_BRANCH_ID_COOKIE)?.value;
  if (cookieId) {
    const match = await prisma.branch.findFirst({ where: { id: cookieId, city, active: true } });
    if (match) return match.id;
  }

  const fallback = await prisma.branch.findFirst({ where: { city, active: true }, orderBy: { sortOrder: "asc" } });
  if (!fallback) throw new Error(`No active branch configured for city "${city}"`);
  return fallback.id;
}
