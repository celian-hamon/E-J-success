// Creates (or resets the password of) an admin account. The seed's demo accounts are not
// meant for production, so this is how the first admin gets in.
//
//   docker compose exec -e ADMIN_PASSWORD='…' app node scripts/create-admin.mjs you@school.org "Your Name"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, name = "Admin"] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 8) {
  console.error("Usage: ADMIN_PASSWORD=<8+ chars> node scripts/create-admin.mjs <email> [name]");
  process.exit(1);
}

const db = new PrismaClient();
const passwordHash = await bcrypt.hash(password, 10);
const user = await db.user.upsert({
  where: { email: email.toLowerCase() },
  update: { passwordHash, role: "ADMIN" },
  create: { email: email.toLowerCase(), name, passwordHash, role: "ADMIN" },
});
console.log(`Admin ready: ${user.email}`);
await db.$disconnect();
