import { DATABASE_SSL } from "$app/env/private";

/**
 * Hosted Postgres providers terminate TLS. A database on a private container
 * network, such as Coolify's, usually does not offer it.
 */
export const databaseSsl = DATABASE_SSL !== "false";
