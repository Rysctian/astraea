import "reflect-metadata";
import { StandardSchemaValidationPipe } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import {
  type CreateReferenceItemDto,
  getReferenceCategoriesByGroup,
  type ListReferenceItemsQuery,
  type ReferenceGroupKey,
  type ReferenceItemRecord,
} from "@starter/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpExceptionFilter } from "../common/filters/http-exception.filter.js";
import { ReferenceSetupController } from "./reference-setup.controller.js";
import { ReferenceSetupService } from "./reference-setup.service.js";

describe("Reference Catalogs Setup HTTP pipeline", () => {
  let app: NestFastifyApplication;
  const items: ReferenceItemRecord[] = [];

  const stubRefService = {
    async getCategories(group: ReferenceGroupKey) {
      return getReferenceCategoriesByGroup(group).map((c) => ({
        ...c,
        totalCount: items.filter((i) => i.category === c.category).length,
        activeCount: items.filter((i) => i.category === c.category && i.isActive).length,
      }));
    },
    async getActiveOptions() {
      return { gender: [] };
    },
    async listItems(group: ReferenceGroupKey, query: ListReferenceItemsQuery) {
      const matched = items.filter((i) => i.group === group && i.category === query.category);
      return {
        data: matched,
        meta: { page: query.page, pageSize: query.pageSize, total: matched.length, totalPages: 1 },
      };
    },
    async create(group: ReferenceGroupKey, dto: CreateReferenceItemDto) {
      const created: ReferenceItemRecord = {
        id: items.length + 1,
        group,
        category: dto.category,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        parentId: dto.parentId ?? null,
        parentName: null,
        parentCode: null,
        metadata: null,
        sortOrder: dto.sortOrder,
        isDefault: dto.isDefault,
        isActive: dto.isActive,
        usageCount: 0,
        isInUse: false,
        usageReason: null,
        createdAt: "2026-11-27T00:00:00.000Z",
        updatedAt: "2026-11-27T00:00:00.000Z",
      };
      items.push(created);
      return created;
    },
    async update() {
      return items[0];
    },
    async remove() {},
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReferenceSetupController],
      providers: [
        { provide: ReferenceSetupService, useValue: stubRefService },
        { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("lists group categories, rejects inactive defaults, and creates/lists items", async () => {
    const catRes = await app.inject({
      method: "GET",
      url: "/reference-setup/groups/employee_information/categories",
    });
    expect(catRes.statusCode).toBe(200);
    expect(catRes.json()).toHaveLength(12);

    const badDefault = await app.inject({
      method: "POST",
      url: "/reference-setup/groups/employee_information/items",
      payload: {
        category: "gender",
        code: "female",
        name: "Female",
        isActive: false,
        isDefault: true,
      },
    });
    expect(badDefault.statusCode).toBe(400);

    const createRes = await app.inject({
      method: "POST",
      url: "/reference-setup/groups/employee_information/items",
      payload: {
        category: "gender",
        code: "female",
        name: "Female",
        isActive: true,
        isDefault: true,
      },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json()).toMatchObject({ code: "FEMALE", isDefault: true });

    const listRes = await app.inject({
      method: "GET",
      url: "/reference-setup/groups/employee_information/items?category=gender",
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toMatchObject({ meta: { total: 1 } });
  });
});
