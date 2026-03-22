import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || "file:data.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
