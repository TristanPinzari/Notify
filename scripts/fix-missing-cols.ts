import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const stmts = [
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "notify_kick" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "notify_banned" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "notify_unbanned" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "notify_invite" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "user_classes" ADD COLUMN IF NOT EXISTS "notify_kick" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "user_classes" ADD COLUMN IF NOT EXISTS "notify_banned" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "user_classes" ADD COLUMN IF NOT EXISTS "notify_unbanned" boolean DEFAULT true NOT NULL`,
];

for (const stmt of stmts) {
  await db.execute(sql.raw(stmt));
  console.log("OK:", stmt.slice(0, 60));
}

await pool.end();
console.log("Done.");
