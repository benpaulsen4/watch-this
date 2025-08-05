import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Create the connection
const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });

export type Database = typeof db;

// Re-export schema for convenience
export * from "./schema";
