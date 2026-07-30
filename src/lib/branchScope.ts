// Server-side helper to resolve which branch a request operates on.
// - Branch-bound users (managers/cashiers) are HARD-SCOPED to their own branch:
//   whatever the client sends is ignored.
// - The super admin (session.branch = null) works on the branch he selected in
//   the sidebar switcher (ACTIVE_BRANCH_COOKIE), defaulting to Suli.
import { cookies } from "next/headers";
import type { Session } from "./auth";
import { ACTIVE_BRANCH_COOKIE, DEFAULT_BRANCH, isBranch, type Branch } from "./branches";

export async function activeBranch(session: Pick<Session, "branch">): Promise<Branch> {
  if (isBranch(session.branch)) return session.branch;
  const c = (await cookies()).get(ACTIVE_BRANCH_COOKIE)?.value;
  return isBranch(c) ? c : DEFAULT_BRANCH;
}
