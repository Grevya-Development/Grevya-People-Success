/**
 * Apply pending migrations to the database in SUPABASE_DB_URL (read from .env.local),
 * i.e. `supabase db push --db-url "$SUPABASE_DB_URL"` without shell substitution.
 *
 *   node scripts/db-push.mjs
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set (.env.local)");
  process.exit(1);
}
const r = spawnSync("npx", ["supabase", "db", "push", "--db-url", url], { stdio: "inherit" });
process.exit(r.status ?? 1);
