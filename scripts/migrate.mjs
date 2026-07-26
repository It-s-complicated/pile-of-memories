import { execFileSync } from "node:child_process";

const connectionString = process.env.DATABASE_CONNECTION_STRING;
if (!connectionString) throw new Error("DATABASE_CONNECTION_STRING is not set");

execFileSync(
  "psql",
  [
    connectionString,
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "migrations/0001_cards.sql",
    "-f",
    "migrations/0002_better_auth.sql",
  ],
  { stdio: "inherit" },
);
