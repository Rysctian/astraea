import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { UsersService } from "./users.service.js";

describe("UsersService", () => {
  it("throws NotFoundException when findOne finds no user", async () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
    };

    const service = new UsersService(fakeDb as never);
    await expect(service.findOne("550e8400-e29b-41d4-a716-446655440000")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("throws ConflictException on Postgres unique constraint violation (23505)", async () => {
    const uniqueError = Object.assign(new Error("duplicate key"), { code: "23505" });
    const fakeDb = {
      insert: () => ({
        values: () => ({
          returning: async () => {
            throw uniqueError;
          },
        }),
      }),
    };

    const service = new UsersService(fakeDb as never);
    await expect(service.create({ email: "dup@example.com", name: "Dup" })).rejects.toThrow(
      ConflictException,
    );
  });
});
