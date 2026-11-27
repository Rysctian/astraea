import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(import.meta.dirname, "../../.env"),
]) {
  if (fs.existsSync(envPath)) {
    try {
      process.loadEnvFile?.(envPath);
      break;
    } catch {
      // ignore
    }
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
