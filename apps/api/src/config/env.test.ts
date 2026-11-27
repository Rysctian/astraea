import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("parses valid environment variables with defaults", () => {
    const env = parseEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app",
    });

    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/app");
    expect(env.PORT).toBe(3001);
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("development");
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => parseEnv({})).toThrow();
  });

  it("throws when PORT is not a valid port number", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/app",
        PORT: "not-a-port",
      }),
    ).toThrow();
  });
});
