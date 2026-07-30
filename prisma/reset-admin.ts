// Resets the `admin` account password back to admin123 (and reactivates it)
// without touching any other data. Run with:  npm run reset-admin
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: { password, active: true },
    create: { username: "admin", password, fullName: "Administrator", role: "admin" },
  });
  console.log(`✓ admin account ready — username "admin", password "admin123" (role ${admin.role})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
