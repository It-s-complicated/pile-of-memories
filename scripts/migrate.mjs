import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const connectionString = process.env.DATABASE_CONNECTION_STRING;
if (!connectionString) throw new Error("DATABASE_CONNECTION_STRING is not set");

const result = spawnSync(
  "psql",
  [
    connectionString,
    "-v",
    "ON_ERROR_STOP=1",
    ...readdirSync("migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .flatMap((name) => ["-f", `migrations/${name}`]),
  ],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(
    result.error.code === "ENOENT"
      ? "psql was not found. Install the PostgreSQL client (Debian/Ubuntu: apt-get install postgresql-client), then rerun db:migrate."
      : `Could not start psql: ${result.error.message}`,
  );
}
process.exitCode = result.status ?? 1;
