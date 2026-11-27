import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth.js";

describe("auth schemas", () => {
  it("normalizes email and accepts valid login payload", () => {
    const parsed = loginSchema.parse({
      email: "  Alice@Example.com ",
      password: "Password123!",
    });
    expect(parsed).toEqual({
      email: "alice@example.com",
      password: "Password123!",
    });
  });

  it("rejects short password in loginSchema", () => {
    const result = loginSchema.safeParse({
      email: "alice@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("trims name and normalizes email in registerSchema", () => {
    const parsed = registerSchema.parse({
      name: "  Alice Smith  ",
      email: "  ALICE@Example.com ",
      password: "Password123!",
    });
    expect(parsed).toEqual({
      name: "Alice Smith",
      email: "alice@example.com",
      password: "Password123!",
    });
  });

  it("rejects empty name in registerSchema", () => {
    const result = registerSchema.safeParse({
      name: "   ",
      email: "alice@example.com",
      password: "Password123!",
    });
    expect(result.success).toBe(false);
  });
});
