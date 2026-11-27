import { describe, expect, it } from "vitest";
import { parseWebEnv } from "./env.js";

describe("parseWebEnv", () => {
  it("defaults VITE_API_URL to /api", () => {
    const env = parseWebEnv({});
    expect(env.VITE_API_URL).toBe("/api");
  });

  it("rejects empty VITE_API_URL", () => {
    expect(() => parseWebEnv({ VITE_API_URL: "" })).toThrow();
  });
});
