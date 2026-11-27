import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "./password.js";

describe("password & session helpers", () => {
  it("hashes and verifies passwords with unique random salts", async () => {
    const hashA = await hashPassword("SuperSecret123!");
    const hashB = await hashPassword("SuperSecret123!");

    expect(hashA).not.toBe(hashB);
    expect(await verifyPassword("SuperSecret123!", hashA)).toBe(true);
    expect(await verifyPassword("WrongPassword!", hashA)).toBe(false);
    expect(await verifyPassword("SuperSecret123!", "malformed-hash")).toBe(false);
  });

  it("generates opaque session tokens and hashes them deterministically", () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
