import app from "./app";
import { logger } from "./lib/logger";
import { readFile } from "node:fs/promises";
import { db, pool, platformOwnersTable } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Additive, transactional schema setup and one-time owner bootstrap run in
// each deployment's own database. ON CONFLICT never restores revoked access.
await pool.query(await readFile(new URL("./club-setup-access.sql", import.meta.url), "utf8"));
const ownerConfig = JSON.parse(await readFile(new URL("./nahreo-owner.json", import.meta.url), "utf8"));
if (typeof ownerConfig.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerConfig.email))
  throw new Error("A valid, explicitly configured Nahreo owner email is required");
await db.insert(platformOwnersTable).values({ email: ownerConfig.email.trim().toLowerCase() }).onConflictDoNothing();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
