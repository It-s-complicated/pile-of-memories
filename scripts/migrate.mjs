import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const connectionString = process.env.DATABASE_CONNECTION_STRING;
if (!connectionString) throw new Error("DATABASE_CONNECTION_STRING is not set");

execFileSync(
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
