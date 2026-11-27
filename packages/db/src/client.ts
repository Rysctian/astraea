import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function createDb(databaseUrl: string) {
  if (!databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(databaseUrl);
  const db = drizzle({ client });

  return { db, client };
}

export type Database = ReturnType<typeof createDb>["db"];
