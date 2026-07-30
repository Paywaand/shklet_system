import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SessionProvider } from "@/lib/session";
import { getBusinessHours } from "@/lib/businessHours";
import { activeBranch } from "@/lib/branchScope";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const grants = await prisma.rolePermission.findMany({
    where: { role: session.role, allowed: true },
    select: { key: true },
  });
  const permissions = grants.map((g) => g.key);

  // The branch this session is operating on (fixed for managers/cashiers; the
  // super admin's current pick from the sidebar switcher).
  const branch = await activeBranch(session);

  // Low-stock badge count for the sidebar — only needed by roles that can see the
  // Warehouse link. Cashiers don't, so skip this DB query entirely for them.
  let lowStockCount = 0;
  if (permissions.includes("inventory.manage")) {
    const lowItems = await prisma.inventoryItem.findMany({
      where: { branch },
      select: { quantity: true, minThreshold: true },
    });
    lowStockCount = lowItems.filter((i) => i.quantity <= i.minThreshold).length;
  }

  // Operating hours drive every business-day range/bucket on the client.
  const businessHours = await getBusinessHours();

  return (
    <SessionProvider
      user={{
        id: session.sub,
        username: session.username,
        fullName: session.fullName,
        role: session.role,
        branch: session.branch,
      }}
      permissions={permissions}
      businessHours={businessHours}
    >
      <div className="lg:flex">
        <Sidebar lowStockCount={lowStockCount} activeBranch={branch} />
        <main className="flex-1 min-w-0 min-h-screen p-4 sm:p-6 max-w-[1400px] mx-auto w-full">
          {children}
        </main>
      </div>
    </SessionProvider>
  );
}
