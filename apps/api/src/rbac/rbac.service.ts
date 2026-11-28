import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type Database, menus, roleMenuAccess, roles, users } from "@starter/db";
import {
  type AssignUserRoleDto,
  type CreateRoleDto,
  type CurrentUserAccessResponse,
  type ListRolesQuery,
  type MenuCatalogGroup,
  type MenuLeafItem,
  type MenuPermissionFlags,
  type PaginatedResponse,
  type RoleDetailRecord,
  type RoleGrantInput,
  type RoleGrantRecord,
  type RoleOptionItem,
  type RoleRecord,
  SYSTEM_ROLE_CODES,
  type UpdateRoleDto,
  type User,
} from "@starter/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { DB } from "../database/database.module.js";

const BASELINE_MENUS: Array<{
  code: string;
  title: string;
  path: string | null;
  parentCode: string | null;
  sortOrder: number;
}> = [
  {
    code: "employee_201",
    title: "Employee 201",
    path: "/employees",
    parentCode: null,
    sortOrder: 10,
  },
  {
    code: "organizational_setup",
    title: "Organizational Setup",
    path: "/organization",
    parentCode: null,
    sortOrder: 20,
  },
  {
    code: "reference_setup",
    title: "Reference Setup",
    path: null,
    parentCode: null,
    sortOrder: 30,
  },
  {
    code: "ref_employee_info",
    title: "Employee Information",
    path: "/setup/employee-info",
    parentCode: "reference_setup",
    sortOrder: 31,
  },
  {
    code: "ref_employment",
    title: "Employment",
    path: "/setup/employment",
    parentCode: "reference_setup",
    sortOrder: 32,
  },
  {
    code: "ref_administrative",
    title: "Administrative",
    path: "/setup/administrative",
    parentCode: "reference_setup",
    sortOrder: 33,
  },
  { code: "user_management", title: "User Management", path: "/", parentCode: null, sortOrder: 40 },
  { code: "attendance", title: "Attendance", path: null, parentCode: null, sortOrder: 50 },
  {
    code: "attendance_logs",
    title: "Attendance & Logs",
    path: "/attendance",
    parentCode: "attendance",
    sortOrder: 50,
  },
  {
    code: "attendance_policies",
    title: "Attendance Policies",
    path: "/attendance/policies",
    parentCode: "attendance",
    sortOrder: 51,
  },
  {
    code: "schedule_management",
    title: "Schedule Management",
    path: "/attendance/schedules",
    parentCode: "attendance",
    sortOrder: 52,
  },
  {
    code: "cut_off_management",
    title: "Cut-Off Management",
    path: "/attendance/cut-offs",
    parentCode: "attendance",
    sortOrder: 53,
  },
  {
    code: "online_applications",
    title: "Online Applications",
    path: null,
    parentCode: null,
    sortOrder: 60,
  },
  {
    code: "approver_setup",
    title: "Approver Setup",
    path: "/applications/approver-setup",
    parentCode: "online_applications",
    sortOrder: 61,
  },
  {
    code: "overtime_applications",
    title: "Overtime Applications",
    path: "/applications/overtime",
    parentCode: "online_applications",
    sortOrder: 62,
  },
];

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const pgError = error as { code?: string; cause?: { code?: string } };
  return pgError.code === "23505" || pgError.cause?.code === "23505";
}

function isSystemRole(code: string): boolean {
  return (SYSTEM_ROLE_CODES as readonly string[]).includes(code);
}

@Injectable()
export class RbacService {
  private seedPromise: Promise<void> | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  async ensureBaselineSeed(): Promise<void> {
    if (!this.seedPromise) {
      this.seedPromise = this.runBaselineSeed().catch((err) => {
        this.seedPromise = null;
        throw err;
      });
    }
    return this.seedPromise;
  }

  private async runBaselineSeed(): Promise<void> {
    await this.db
      .insert(roles)
      .values([
        { code: "admin", name: "Administrator" },
        { code: "employee", name: "Employee" },
      ])
      .onConflictDoNothing({ target: roles.code });

    // Insert parent menus first, then leaf menus
    const parents = BASELINE_MENUS.filter((m) => m.parentCode === null);
    for (const m of parents) {
      await this.db
        .insert(menus)
        .values({
          code: m.code,
          title: m.title,
          path: m.path,
          parentId: null,
          sortOrder: m.sortOrder,
          isActive: true,
        })
        .onConflictDoNothing({ target: menus.code });
    }

    const parentRows = await this.db
      .select({ id: menus.id, code: menus.code })
      .from(menus)
      .where(isNull(menus.parentId));
    const parentIdByCode = new Map(parentRows.map((p) => [p.code, p.id]));

    const children = BASELINE_MENUS.filter((m) => m.parentCode !== null);
    for (const m of children) {
      await this.db
        .insert(menus)
        .values({
          code: m.code,
          title: m.title,
          path: m.path,
          parentId: m.parentCode ? (parentIdByCode.get(m.parentCode) ?? null) : null,
          sortOrder: m.sortOrder,
          isActive: true,
        })
        .onConflictDoNothing({ target: menus.code });
    }

    const [adminRole] = await this.db.select().from(roles).where(eq(roles.code, "admin")).limit(1);
    const [employeeRole] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.code, "employee"))
      .limit(1);

    const leafMenus = await this.db
      .select()
      .from(menus)
      .where(and(eq(menus.isActive, true), isNotNull(menus.path)));

    if (adminRole && leafMenus.length > 0) {
      await this.db
        .insert(roleMenuAccess)
        .values(
          leafMenus.map((m) => ({
            roleId: adminRole.id,
            menuId: m.id,
            canView: true,
            canCreate: true,
            canUpdate: true,
            canDelete: true,
          })),
        )
        .onConflictDoNothing({ target: [roleMenuAccess.roleId, roleMenuAccess.menuId] });
    }

    if (employeeRole) {
      const empMenu = leafMenus.find((m) => m.code === "employee_201");
      if (empMenu) {
        await this.db
          .insert(roleMenuAccess)
          .values({
            roleId: employeeRole.id,
            menuId: empMenu.id,
            canView: true,
            canCreate: false,
            canUpdate: false,
            canDelete: false,
          })
          .onConflictDoNothing({ target: [roleMenuAccess.roleId, roleMenuAccess.menuId] });
      }

      const overtimeMenu = leafMenus.find((m) => m.code === "overtime_applications");
      if (overtimeMenu) {
        await this.db
          .insert(roleMenuAccess)
          .values({
            roleId: employeeRole.id,
            menuId: overtimeMenu.id,
            canView: true,
            canCreate: true,
            canUpdate: true,
            canDelete: false,
          })
          .onConflictDoNothing({ target: [roleMenuAccess.roleId, roleMenuAccess.menuId] });
      }
    }

    // Backfill existing users with no role assigned yet
    if (adminRole && employeeRole) {
      const unassignedUsers = await this.db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(isNull(users.roleId));

      for (const u of unassignedUsers) {
        const looksAdmin =
          u.email.toLowerCase().includes("admin") || u.name.toLowerCase().includes("admin");
        await this.db
          .update(users)
          .set({ roleId: looksAdmin ? adminRole.id : employeeRole.id })
          .where(eq(users.id, u.id));
      }
    }
  }

  async listRoles(query: ListRolesQuery): Promise<PaginatedResponse<RoleRecord>> {
    await this.ensureBaselineSeed();

    const offset = (query.page - 1) * query.pageSize;
    const conditions: SQL[] = [];

    if (query.search) {
      const p = `%${query.search}%`;
      const cond = or(ilike(roles.name, p), ilike(roles.code, p));
      if (cond) {
        conditions.push(cond);
      }
    }
    if (query.code) {
      conditions.push(ilike(roles.code, `%${query.code}%`));
    }
    if (query.createdFrom) {
      conditions.push(gte(roles.createdAt, new Date(`${query.createdFrom}T00:00:00Z`)));
    }
    if (query.createdTo) {
      conditions.push(lte(roles.createdAt, new Date(`${query.createdTo}T23:59:59.999Z`)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const sortDirFn = query.sortDir === "asc" ? asc : desc;
    const sortCol =
      query.sortBy === "id"
        ? roles.id
        : query.sortBy === "code"
          ? roles.code
          : query.sortBy === "name"
            ? roles.name
            : roles.createdAt;

    const [[totalRow], rows] = await Promise.all([
      this.db.select({ value: count() }).from(roles).where(where),
      this.db
        .select()
        .from(roles)
        .where(where)
        .orderBy(sortDirFn(sortCol), asc(roles.id))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    const roleIds = rows.map((r) => r.id);
    const [userCounts, grantCounts] =
      roleIds.length > 0
        ? await Promise.all([
            this.db
              .select({ roleId: users.roleId, total: count() })
              .from(users)
              .where(inArray(users.roleId, roleIds))
              .groupBy(users.roleId),
            this.db
              .select({ roleId: roleMenuAccess.roleId, total: count() })
              .from(roleMenuAccess)
              .where(and(inArray(roleMenuAccess.roleId, roleIds), eq(roleMenuAccess.canView, true)))
              .groupBy(roleMenuAccess.roleId),
          ])
        : [[], []];

    const userCountMap = new Map(
      userCounts.filter((u) => u.roleId !== null).map((u) => [u.roleId as number, Number(u.total)]),
    );
    const grantCountMap = new Map(grantCounts.map((g) => [g.roleId, Number(g.total)]));

    const total = Number(totalRow?.value ?? 0);

    return {
      data: rows.map((row) =>
        this.toRoleRecord(row, userCountMap.get(row.id) ?? 0, grantCountMap.get(row.id) ?? 0),
      ),
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async getRoleOptions(): Promise<RoleOptionItem[]> {
    await this.ensureBaselineSeed();
    return this.db
      .select({ id: roles.id, code: roles.code, name: roles.name })
      .from(roles)
      .orderBy(asc(roles.id));
  }

  async getMenuCatalog(): Promise<MenuCatalogGroup[]> {
    await this.ensureBaselineSeed();

    const allMenus = await this.db
      .select()
      .from(menus)
      .where(eq(menus.isActive, true))
      .orderBy(asc(menus.sortOrder), asc(menus.id));

    const parentMap = new Map(allMenus.filter((m) => m.path === null).map((m) => [m.id, m]));
    const leaves = allMenus.filter((m): m is typeof m & { path: string } => m.path !== null);

    const groupsMap = new Map<number | null, MenuCatalogGroup>();

    for (const leaf of leaves) {
      const parent = leaf.parentId !== null ? parentMap.get(leaf.parentId) : undefined;
      const groupKey = parent ? parent.id : null;
      let group = groupsMap.get(groupKey);
      if (!group) {
        group = {
          parentId: parent?.id ?? null,
          parentCode: parent?.code ?? null,
          parentTitle: parent?.title ?? "General Modules",
          sortOrder: parent?.sortOrder ?? 0,
          items: [],
        };
        groupsMap.set(groupKey, group);
      }
      const item: MenuLeafItem = {
        id: leaf.id,
        code: leaf.code,
        title: leaf.title,
        path: leaf.path,
        parentId: leaf.parentId,
        sortOrder: leaf.sortOrder,
      };
      group.items.push(item);
    }

    return Array.from(groupsMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getRoleById(id: number): Promise<RoleDetailRecord> {
    await this.ensureBaselineSeed();

    const [role] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!role) {
      throw new NotFoundException(`Role #${id} not found`);
    }

    const [[userRow], grantRows] = await Promise.all([
      this.db.select({ total: count() }).from(users).where(eq(users.roleId, id)),
      this.db
        .select({
          menuId: roleMenuAccess.menuId,
          menuCode: menus.code,
          menuTitle: menus.title,
          canView: roleMenuAccess.canView,
          canCreate: roleMenuAccess.canCreate,
          canUpdate: roleMenuAccess.canUpdate,
          canDelete: roleMenuAccess.canDelete,
        })
        .from(roleMenuAccess)
        .innerJoin(menus, eq(roleMenuAccess.menuId, menus.id))
        .where(eq(roleMenuAccess.roleId, id))
        .orderBy(asc(menus.sortOrder)),
    ]);

    const grants: RoleGrantRecord[] = grantRows.map((g) => ({
      menuId: g.menuId,
      menuCode: g.menuCode,
      menuTitle: g.menuTitle,
      canView: g.canView,
      canCreate: g.canCreate,
      canUpdate: g.canUpdate,
      canDelete: g.canDelete,
    }));

    return {
      ...this.toRoleRecord(
        role,
        Number(userRow?.total ?? 0),
        grants.filter((g) => g.canView).length,
      ),
      grants,
    };
  }

  async createRole(dto: CreateRoleDto): Promise<RoleDetailRecord> {
    await this.ensureBaselineSeed();

    try {
      const createdId = await this.db.transaction(async (tx) => {
        const activeGrants = await this.validateAndFilterGrants(tx, dto.grants);

        const [created] = await tx
          .insert(roles)
          .values({
            code: dto.code,
            name: dto.name,
          })
          .returning();

        if (!created) {
          throw new Error("Failed to create role");
        }

        if (activeGrants.length > 0) {
          await tx.insert(roleMenuAccess).values(
            activeGrants.map((g) => ({
              roleId: created.id,
              menuId: g.menuId,
              canView: g.canView,
              canCreate: g.canCreate,
              canUpdate: g.canUpdate,
              canDelete: g.canDelete,
            })),
          );
        }

        return created.id;
      });

      return this.getRoleById(createdId);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`Role code "${dto.code}" already exists`);
      }
      throw error;
    }
  }

  async updateRole(id: number, dto: UpdateRoleDto): Promise<RoleDetailRecord> {
    await this.ensureBaselineSeed();

    await this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(roles).where(eq(roles.id, id)).for("update");
      if (!existing) {
        throw new NotFoundException(`Role #${id} not found`);
      }

      const activeGrants = await this.validateAndFilterGrants(tx, dto.grants);

      // Prevent stripping user_management view/update from the admin role (self-lockout guard)
      if (existing.code === "admin") {
        const [umMenu] = await tx
          .select({ id: menus.id })
          .from(menus)
          .where(eq(menus.code, "user_management"))
          .limit(1);

        if (umMenu) {
          const umGrant = activeGrants.find((g) => g.menuId === umMenu.id);
          if (!umGrant?.canView || !umGrant.canUpdate) {
            throw new BadRequestException(
              "Cannot remove User Management view/update access from the Administrator role",
            );
          }
        }
      }

      await tx.update(roles).set({ name: dto.name, updatedAt: new Date() }).where(eq(roles.id, id));

      await tx.delete(roleMenuAccess).where(eq(roleMenuAccess.roleId, id));

      if (activeGrants.length > 0) {
        await tx.insert(roleMenuAccess).values(
          activeGrants.map((g) => ({
            roleId: id,
            menuId: g.menuId,
            canView: g.canView,
            canCreate: g.canCreate,
            canUpdate: g.canUpdate,
            canDelete: g.canDelete,
          })),
        );
      }
    });

    return this.getRoleById(id);
  }

  async deleteRole(id: number): Promise<void> {
    await this.ensureBaselineSeed();

    await this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(roles).where(eq(roles.id, id)).for("update");
      if (!existing) {
        throw new NotFoundException(`Role #${id} not found`);
      }

      if (isSystemRole(existing.code)) {
        throw new ConflictException(`Seeded system role "${existing.name}" cannot be deleted`);
      }

      const [assigned] = await tx
        .select({ total: count() })
        .from(users)
        .where(eq(users.roleId, id));
      const userCount = Number(assigned?.total ?? 0);

      if (userCount > 0) {
        throw new ConflictException(
          `Cannot delete role "${existing.name}" because it is assigned to ${userCount} user${userCount === 1 ? "" : "s"}`,
        );
      }

      await tx.delete(roles).where(eq(roles.id, id));
    });
  }

  async assignUserRole(
    targetUserId: string,
    dto: AssignUserRoleDto,
    actorUserId: string,
  ): Promise<User> {
    await this.ensureBaselineSeed();

    return this.db.transaction(async (tx) => {
      const [targetUser] = await tx
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .for("update");

      if (!targetUser) {
        throw new NotFoundException(`User ${targetUserId} not found`);
      }

      const [nextRole] = await tx.select().from(roles).where(eq(roles.id, dto.roleId)).limit(1);

      if (!nextRole) {
        throw new BadRequestException(`Role #${dto.roleId} does not exist`);
      }

      // Self-lockout guard: prevent demoting own admin role if no other admin exists
      if (targetUserId === actorUserId && targetUser.roleId !== nextRole.id) {
        const [adminRole] = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.code, "admin"))
          .limit(1);

        if (adminRole && targetUser.roleId === adminRole.id && nextRole.id !== adminRole.id) {
          const [otherAdmins] = await tx
            .select({ total: count() })
            .from(users)
            .where(and(eq(users.roleId, adminRole.id), ne(users.id, targetUserId)));

          if (Number(otherAdmins?.total ?? 0) === 0) {
            throw new BadRequestException(
              "Cannot demote your own Administrator role because no other active administrator exists",
            );
          }
        }
      }

      const [updated] = await tx
        .update(users)
        .set({ roleId: nextRole.id, updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
        .returning({
          id: users.id,
          employeeId: users.employeeId,
          roleId: users.roleId,
          email: users.email,
          name: users.name,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });

      if (!updated) {
        throw new NotFoundException(`User ${targetUserId} not found`);
      }

      return {
        ...updated,
        roleCode: nextRole.code,
        roleName: nextRole.name,
      };
    });
  }

  async getCurrentUserAccess(userId: string): Promise<CurrentUserAccessResponse> {
    await this.ensureBaselineSeed();

    const [user] = await this.db
      .select({ id: users.id, roleId: users.roleId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.roleId === null) {
      return { role: null, permissions: {}, navigation: [] };
    }

    const [role] = await this.db
      .select({ id: roles.id, code: roles.code, name: roles.name })
      .from(roles)
      .where(eq(roles.id, user.roleId))
      .limit(1);

    if (!role) {
      return { role: null, permissions: {}, navigation: [] };
    }

    const [activeMenus, grants] = await Promise.all([
      this.db
        .select()
        .from(menus)
        .where(eq(menus.isActive, true))
        .orderBy(asc(menus.sortOrder), asc(menus.id)),
      this.db.select().from(roleMenuAccess).where(eq(roleMenuAccess.roleId, role.id)),
    ]);

    const grantByMenuId = new Map(grants.map((g) => [g.menuId, g]));
    const permissions: Record<string, MenuPermissionFlags> = {};

    for (const m of activeMenus) {
      if (m.path === null) continue;
      const g = grantByMenuId.get(m.id);
      if (g?.canView) {
        permissions[m.code] = {
          canView: g.canView,
          canCreate: g.canCreate,
          canUpdate: g.canUpdate,
          canDelete: g.canDelete,
        };
      }
    }

    const rootMenus = activeMenus.filter((m) => m.parentId === null);
    const navigation: CurrentUserAccessResponse["navigation"] = [];

    for (const root of rootMenus) {
      if (root.path !== null) {
        if (permissions[root.code]?.canView) {
          navigation.push({
            id: root.id,
            code: root.code,
            title: root.title,
            path: root.path,
            children: [],
          });
        }
      } else {
        const visibleChildren = activeMenus
          .filter(
            (c): c is typeof c & { path: string } =>
              c.parentId === root.id && c.path !== null && Boolean(permissions[c.code]?.canView),
          )
          .map((c) => ({
            id: c.id,
            code: c.code,
            title: c.title,
            path: c.path,
          }));

        if (visibleChildren.length > 0) {
          navigation.push({
            id: root.id,
            code: root.code,
            title: root.title,
            path: null,
            children: visibleChildren,
          });
        }
      }
    }

    return { role, permissions, navigation };
  }

  /**
   * Resolves a user's RBAC permissions and administrative authority flags.
   * Per Modules 11 & 12: administrative authority includes system admin role,
   * user_management view, or approver_setup view.
   */
  async getActorAuthority(userId: string): Promise<{
    roleCode: string | null;
    permissions: Record<string, MenuPermissionFlags>;
    isAdmin: boolean;
  }> {
    const access = await this.getCurrentUserAccess(userId);
    const roleCode = access.role?.code ?? null;
    const isAdmin =
      roleCode === "admin" ||
      Boolean(access.permissions.user_management?.canView) ||
      Boolean(access.permissions.approver_setup?.canView);

    return {
      roleCode,
      permissions: access.permissions,
      isAdmin,
    };
  }

  private async validateAndFilterGrants(
    tx: Pick<Database, "select">,
    grants: RoleGrantInput[],
  ): Promise<RoleGrantInput[]> {
    const nonEmpty = grants.filter((g) => g.canView || g.canCreate || g.canUpdate || g.canDelete);
    if (nonEmpty.length === 0) {
      return [];
    }

    for (const g of nonEmpty) {
      if ((g.canCreate || g.canUpdate || g.canDelete) && !g.canView) {
        throw new BadRequestException("View permission is required when any write flag is enabled");
      }
    }

    const menuIds = nonEmpty.map((g) => g.menuId);
    const validLeaves = await tx
      .select({ id: menus.id })
      .from(menus)
      .where(and(inArray(menus.id, menuIds), eq(menus.isActive, true), isNotNull(menus.path)));

    if (validLeaves.length !== menuIds.length) {
      throw new BadRequestException(
        "Permission grants may only target active, navigable leaf menus",
      );
    }

    return nonEmpty;
  }

  private toRoleRecord(
    row: typeof roles.$inferSelect,
    userCount: number,
    grantCount: number,
  ): RoleRecord {
    const system = isSystemRole(row.code);
    const deleteBlockedReason = system
      ? "Seeded system role cannot be deleted"
      : userCount > 0
        ? `Assigned to ${userCount} user${userCount === 1 ? "" : "s"}`
        : null;

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      isSystem: system,
      userCount,
      grantCount,
      canDelete: deleteBlockedReason === null,
      deleteBlockedReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
