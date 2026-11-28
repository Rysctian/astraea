import { describe, expect, it } from "vitest";
import { createUserSchema, updateUserSchema, userIdParamSchema, userSchema } from "./user.js";

describe("user schemas", () => {
  it("accepts a valid createUser payload and trims strings", () => {
    const parsed = createUserSchema.parse({
      email: "  alice@example.com  ",
      name: "  Alice Smith  ",
    });
    expect(parsed).toEqual({
      email: "alice@example.com",
      name: "Alice Smith",
    });
  });

  it("rejects malformed email in createUserSchema", () => {
    const result = createUserSchema.safeParse({
      email: "not-an-email",
      name: "Alice",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty or whitespace-only name in createUserSchema", () => {
    const result = createUserSchema.safeParse({
      email: "alice@example.com",
      name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty updateUserSchema payload", () => {
    const result = updateUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts partial updateUserSchema payload", () => {
    const result = updateUserSchema.parse({ name: "Bob" });
    expect(result).toEqual({ name: "Bob" });
  });

  it("validates UUID in userIdParamSchema", () => {
    expect(
      userIdParamSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" }).success,
    ).toBe(true);
    expect(userIdParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  it("validates full user record with userSchema", () => {
    const now = new Date();
    const parsed = userSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      employeeId: null,
      roleId: null,
      email: "alice@example.com",
      name: "Alice",
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.email).toBe("alice@example.com");
  });
});
