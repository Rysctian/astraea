import type {
  AssignUserRoleDto,
  AttendancePolicyOptionsResponse,
  AttendancePolicyRecord,
  BatchAssignScheduleDto,
  CreateAttendancePolicyDto,
  CreateCutOffDto,
  CreateEmployeeDto,
  CreateReferenceItemDto,
  CreateRoleDto,
  CreateScheduleDto,
  CreateUserDto,
  CurrentUserAccessResponse,
  CutOffPresetItem,
  CutOffRecord,
  CutOffScheduleType,
  Employee,
  EmployeeScheduleRecord,
  EmployeeSupervisorSummary,
  ListAttendancePoliciesQuery,
  ListCutOffsQuery,
  ListEmployeeSchedulesQuery,
  ListEmployeesQuery,
  ListOrgQuery,
  ListReferenceItemsQuery,
  ListRolesQuery,
  ListSchedulesQuery,
  ListUsersQuery,
  LoginDto,
  MenuCatalogGroup,
  OrgActiveOptions,
  OrgEntityType,
  OrgHierarchyTree,
  OrgRecord,
  OrgSummaryCounts,
  PaginatedResponse,
  ReferenceActiveOptionsMap,
  ReferenceCategorySummary,
  ReferenceGroupKey,
  ReferenceItemRecord,
  RegisterDto,
  ResolvedScheduleResponse,
  RoleDetailRecord,
  RoleOptionItem,
  RoleRecord,
  ScheduleRecord,
  UpdateAttendancePolicyDto,
  UpdateCutOffDto,
  UpdateEmployeeDto,
  UpdateEmployeeScheduleDto,
  UpdateReferenceItemDto,
  UpdateRoleDto,
  UpdateScheduleDto,
  User,
} from "@starter/shared";
import { webEnv } from "@/env";

export type ApiUser = Omit<User, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export type ApiEmployee = Omit<Employee, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

export interface ApiEmployeeDetail {
  employee: ApiEmployee;
  supervisor: EmployeeSupervisorSummary | null;
  account: ApiUser | null;
}

export interface ApiAuthResponse {
  user: ApiUser;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function toQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${webEnv.VITE_API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? `Request failed with status ${res.status}`);
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const api = {
  authMe: () => request<ApiAuthResponse>("/auth/me"),
  login: (data: LoginDto) =>
    request<ApiAuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  register: (data: RegisterDto) =>
    request<ApiAuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  logout: () =>
    request<void>("/auth/logout", {
      method: "POST",
    }),

  listUsers: (query: Partial<ListUsersQuery> = {}) =>
    request<PaginatedResponse<ApiUser>>(`/users${toQueryString(query)}`),
  createUser: (data: CreateUserDto) =>
    request<ApiUser>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteUser: (id: string) =>
    request<void>(`/users/${id}`, {
      method: "DELETE",
    }),

  listEmployees: (query: Partial<ListEmployeesQuery> = {}) =>
    request<PaginatedResponse<ApiEmployee>>(`/employees${toQueryString(query)}`),
  getEmployee: (employeeId: string) =>
    request<ApiEmployeeDetail>(`/employees/${encodeURIComponent(employeeId)}`),
  createEmployee: (data: CreateEmployeeDto) =>
    request<ApiEmployeeDetail>("/employees", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEmployee: (employeeId: string, data: UpdateEmployeeDto) =>
    request<ApiEmployeeDetail>(`/employees/${encodeURIComponent(employeeId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Organizational Setup
  getOrgSummary: () => request<OrgSummaryCounts>("/organization/summary"),
  getOrgActiveOptions: () => request<OrgActiveOptions>("/organization/options"),
  getOrgTree: (includeInactive = false) =>
    request<OrgHierarchyTree>(`/organization/tree${toQueryString({ includeInactive })}`),
  listOrgEntities: (entity: OrgEntityType, query: Partial<ListOrgQuery> = {}) =>
    request<PaginatedResponse<OrgRecord>>(`/organization/${entity}${toQueryString(query)}`),
  createOrgEntity: (entity: OrgEntityType, data: Record<string, unknown>) =>
    request<OrgRecord>(`/organization/${entity}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateOrgEntity: (entity: OrgEntityType, id: number, data: Record<string, unknown>) =>
    request<OrgRecord>(`/organization/${entity}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteOrgEntity: (entity: OrgEntityType, id: number) =>
    request<void>(`/organization/${entity}/${id}`, {
      method: "DELETE",
    }),

  // Reference Catalogs Setup
  getReferenceCategories: (group: ReferenceGroupKey) =>
    request<ReferenceCategorySummary[]>(`/reference-setup/groups/${group}/categories`),
  listReferenceItems: (group: ReferenceGroupKey, query: Partial<ListReferenceItemsQuery>) =>
    request<PaginatedResponse<ReferenceItemRecord>>(
      `/reference-setup/groups/${group}/items${toQueryString(query)}`,
    ),
  getReferenceActiveOptions: (categories?: string[]) =>
    request<ReferenceActiveOptionsMap>(
      `/reference-setup/options${toQueryString({
        categories: categories && categories.length > 0 ? categories.join(",") : undefined,
      })}`,
    ),
  createReferenceItem: (group: ReferenceGroupKey, data: CreateReferenceItemDto) =>
    request<ReferenceItemRecord>(`/reference-setup/groups/${group}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateReferenceItem: (group: ReferenceGroupKey, id: number, data: UpdateReferenceItemDto) =>
    request<ReferenceItemRecord>(`/reference-setup/groups/${group}/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteReferenceItem: (group: ReferenceGroupKey, id: number) =>
    request<void>(`/reference-setup/groups/${group}/items/${id}`, {
      method: "DELETE",
    }),

  // Attendance Policies
  listAttendancePolicies: (query: Partial<ListAttendancePoliciesQuery> = {}) =>
    request<PaginatedResponse<AttendancePolicyRecord>>(
      `/attendance-policies${toQueryString(query)}`,
    ),
  getAttendancePolicyOptions: () =>
    request<AttendancePolicyOptionsResponse>("/attendance-policies/options"),
  createAttendancePolicy: (data: CreateAttendancePolicyDto) =>
    request<AttendancePolicyRecord>("/attendance-policies", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateAttendancePolicy: (id: number, data: UpdateAttendancePolicyDto) =>
    request<AttendancePolicyRecord>(`/attendance-policies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteAttendancePolicy: (id: number) =>
    request<void>(`/attendance-policies/${id}`, {
      method: "DELETE",
    }),

  // Schedule Management
  listSchedules: (query: Partial<ListSchedulesQuery> = {}) =>
    request<PaginatedResponse<ScheduleRecord>>(`/schedules${toQueryString(query)}`),
  createSchedule: (data: CreateScheduleDto) =>
    request<ScheduleRecord>("/schedules", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSchedule: (id: number, data: UpdateScheduleDto) =>
    request<ScheduleRecord>(`/schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteSchedule: (id: number) =>
    request<void>(`/schedules/${id}`, {
      method: "DELETE",
    }),
  listEmployeeSchedules: (query: Partial<ListEmployeeSchedulesQuery> = {}) =>
    request<PaginatedResponse<EmployeeScheduleRecord>>(
      `/schedules/assignments${toQueryString(query)}`,
    ),
  batchAssignSchedule: (data: BatchAssignScheduleDto) =>
    request<EmployeeScheduleRecord[]>("/schedules/assignments/batch", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEmployeeSchedule: (id: number, data: UpdateEmployeeScheduleDto) =>
    request<EmployeeScheduleRecord>(`/schedules/assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteEmployeeSchedule: (id: number) =>
    request<void>(`/schedules/assignments/${id}`, {
      method: "DELETE",
    }),
  resolveEmployeeSchedule: (employeeId: string, from: string, to: string) =>
    request<ResolvedScheduleResponse>(
      `/schedules/employees/${encodeURIComponent(employeeId)}/resolve${toQueryString({ from, to })}`,
    ),

  // Cut-Off Management
  listCutOffs: (query: Partial<ListCutOffsQuery> = {}) =>
    request<PaginatedResponse<CutOffRecord>>(`/cut-offs${toQueryString(query)}`),
  getCutOffPresets: (scheduleType?: CutOffScheduleType) =>
    request<CutOffPresetItem[]>(`/cut-offs/presets${toQueryString({ scheduleType })}`),
  createCutOff: (data: CreateCutOffDto) =>
    request<CutOffRecord>("/cut-offs", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCutOff: (id: number, data: UpdateCutOffDto) =>
    request<CutOffRecord>(`/cut-offs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteCutOff: (id: number) =>
    request<void>(`/cut-offs/${id}`, {
      method: "DELETE",
    }),

  // RBAC: Roles, Menus & User Access
  getMyAccess: () => request<CurrentUserAccessResponse>("/rbac/me"),
  getMenuCatalog: () => request<MenuCatalogGroup[]>("/rbac/menus"),
  listRoles: (query: Partial<ListRolesQuery> = {}) =>
    request<PaginatedResponse<RoleRecord>>(`/rbac/roles${toQueryString(query)}`),
  getRoleOptions: () => request<RoleOptionItem[]>("/rbac/roles/options"),
  getRoleById: (id: number) => request<RoleDetailRecord>(`/rbac/roles/${id}`),
  createRole: (data: CreateRoleDto) =>
    request<RoleDetailRecord>("/rbac/roles", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateRole: (id: number, data: UpdateRoleDto) =>
    request<RoleDetailRecord>(`/rbac/roles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteRole: (id: number) =>
    request<void>(`/rbac/roles/${id}`, {
      method: "DELETE",
    }),
  assignUserRole: (userId: string, data: AssignUserRoleDto) =>
    request<ApiUser>(`/rbac/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};
