import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

// The default @/server/db client uses Neon's HTTP driver, which is
// stateless (one request per query) and cannot support db.transaction().
// This client uses Neon's WebSocket-based Pool instead, which does —
// import it only where a multi-statement transaction is actually needed,
// not as the file-wide default, since each serverless container gets its
// own pool and every other query is cheaper on the stateless HTTP client.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

// Without a listener, an error on an idle connection (e.g. Neon closing it
// server-side while the container sits warm-but-quiet) is an unhandled
// EventEmitter 'error' and crashes the whole process.
pool.on("error", (err: Error) => {
  console.error("[db/transactional] idle client error:", err);
});

export const db = drizzle(pool);
