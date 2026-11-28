import type {
  ApplicationType,
  ApproverWorkflowGroupRecord,
  AssignUserRoleDto,
  AttendanceLogRecord,
  AttendancePolicyOptionsResponse,
  AttendancePolicyRecord,
  BatchAssignScheduleDto,
  BulkAllocateCreditsResult,
  BulkAllocateLeaveCreditsDto,
  CorrectionApplicationRecord,
  CorrectionFilingContext,
  CorrectionLogPreviewResponse,
  CreateAttendancePolicyDto,
  CreateCorrectionApplicationDto,
  CreateCutOffDto,
  CreateEmployeeDto,
  CreateLeaveApplicationDto,
  CreateLeavePolicyDto,
  CreateLeaveTypeDto,
  CreateManualLogDto,
  CreateOfficialBusinessApplicationDto,
  CreateOfficialBusinessBatchResult,
  CreateOvertimeApplicationDto,
  CreateOvertimeBatchResult,
  CreateReferenceItemDto,
  CreateRoleDto,
  CreateScheduleDto,
  CreateUserDto,
  CurrentUserAccessResponse,
  CutOffPresetItem,
  CutOffRecord,
  CutOffScheduleType,
  DecisionRemarksDto,
  DtrQuery,
  DtrResponse,
  Employee,
  EmployeeLeaveCreditRecord,
  EmployeeScheduleRecord,
  EmployeeSupervisorSummary,
  ImportLogsResult,
  ImportLogsRowError,
  LeaveApplicationRecord,
  LeaveCreditLogRecord,
  LeaveFilingOptionsResponse,
  LeavePolicyRecord,
  LeaveTypeRecord,
  ListApproverWorkflowsQuery,
  ListAttendanceLogsQuery,
  ListAttendancePoliciesQuery,
  ListCorrectionApplicationsQuery,
  ListCutOffsQuery,
  ListEmployeeSchedulesQuery,
  ListEmployeesQuery,
  ListLeaveApplicationsQuery,
  ListLeaveCreditsQuery,
  ListLeavePoliciesQuery,
  ListLeaveTypesQuery,
  ListOfficialBusinessApplicationsQuery,
  ListOrgQuery,
  ListOvertimeApplicationsQuery,
  ListReferenceItemsQuery,
  ListRolesQuery,
  ListSchedulesQuery,
  ListUsersQuery,
  LoginDto,
  ManualLogResult,
  MenuCatalogGroup,
  OfficialBusinessApplicationRecord,
  OfficialBusinessFilingContext,
  OrgActiveOptions,
  OrgEntityType,
  OrgHierarchyTree,
  OrgRecord,
  OrgSummaryCounts,
  OvertimeApplicationRecord,
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
  SaveApproverWorkflowDto,
  SaveApproverWorkflowResult,
  ScheduleRecord,
  UpdateAttendancePolicyDto,
  UpdateCutOffDto,
  UpdateEmployeeDto,
  UpdateEmployeeScheduleDto,
  UpdateLeavePolicyDto,
  UpdateLeaveTypeDto,
  UpdateReferenceItemDto,
  UpdateRoleDto,
  UpdateScheduleDto,
  UpsertLeaveCreditDto,
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
    public readonly rowErrors?: ImportLogsRowError[],
    public readonly code?: string,
    public readonly applicationType?: ApplicationType,
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
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
      code?: string;
      applicationType?: ApplicationType;
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? `Request failed with status ${res.status}`);
    throw new ApiError(message, res.status, undefined, body?.code, body?.applicationType);
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

  // Attendance & Logs (DTR)
  getDtr: (query: DtrQuery) => request<DtrResponse>(`/attendance/dtr${toQueryString(query)}`),
  listAttendanceLogs: (query: Partial<ListAttendanceLogsQuery> = {}) =>
    request<PaginatedResponse<AttendanceLogRecord>>(`/attendance/logs${toQueryString(query)}`),
  createManualLogs: (data: CreateManualLogDto) =>
    request<ManualLogResult>("/attendance/logs/manual", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getAttendanceTemplateUrl: () => `${webEnv.VITE_API_URL}/attendance/logs/template`,
  importAttendanceLogs: async (file: File): Promise<ImportLogsResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${webEnv.VITE_API_URL}/attendance/logs/import`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string | string[];
        errors?: ImportLogsRowError[];
      } | null;
      const message = Array.isArray(body?.message)
        ? body.message.join(", ")
        : (body?.message ?? `Import failed with status ${res.status}`);
      throw new ApiError(message, res.status, body?.errors);
    }
    return (await res.json()) as ImportLogsResult;
  },

  // Approver Setup (Module 11)
  listApproverWorkflows: (query: Partial<ListApproverWorkflowsQuery> = {}) =>
    request<PaginatedResponse<ApproverWorkflowGroupRecord>>(
      `/approver-setup${toQueryString(query)}`,
    ),
  getApproverWorkflow: (employeeId: string, applicationType: ApplicationType) =>
    request<ApproverWorkflowGroupRecord>(
      `/approver-setup/${encodeURIComponent(employeeId)}/${applicationType}`,
    ),
  saveApproverWorkflows: (data: SaveApproverWorkflowDto) =>
    request<SaveApproverWorkflowResult>("/approver-setup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteApproverWorkflow: (employeeId: string, applicationType: ApplicationType) =>
    request<void>(`/approver-setup/${encodeURIComponent(employeeId)}/${applicationType}`, {
      method: "DELETE",
    }),

  // Overtime Applications (Module 12)
  listOvertimeApplications: (query: Partial<ListOvertimeApplicationsQuery> = {}) =>
    request<PaginatedResponse<OvertimeApplicationRecord>>(`/overtime${toQueryString(query)}`),
  getOvertimeApplication: (id: number) => request<OvertimeApplicationRecord>(`/overtime/${id}`),
  createOvertimeApplications: (data: CreateOvertimeApplicationDto) =>
    request<CreateOvertimeBatchResult>("/overtime", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  approveOvertimeApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<OvertimeApplicationRecord>(`/overtime/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  disapproveOvertimeApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<OvertimeApplicationRecord>(`/overtime/${id}/disapprove`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  cancelOvertimeApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<OvertimeApplicationRecord>(`/overtime/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Leave Management (Module 15)
  getLeaveFilingOptions: () => request<LeaveFilingOptionsResponse>("/leave/options"),
  getMyLeaveCredits: (year?: number) =>
    request<EmployeeLeaveCreditRecord[]>(`/leave/credits/my${toQueryString({ year })}`),

  listLeavePolicies: (query: Partial<ListLeavePoliciesQuery> = {}) =>
    request<PaginatedResponse<LeavePolicyRecord>>(`/leave/policies${toQueryString(query)}`),
  createLeavePolicy: (data: CreateLeavePolicyDto) =>
    request<LeavePolicyRecord>("/leave/policies", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateLeavePolicy: (id: number, data: UpdateLeavePolicyDto) =>
    request<LeavePolicyRecord>(`/leave/policies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteLeavePolicy: (id: number) =>
    request<void>(`/leave/policies/${id}`, {
      method: "DELETE",
    }),

  listLeaveTypes: (query: Partial<ListLeaveTypesQuery> = {}) =>
    request<PaginatedResponse<LeaveTypeRecord>>(`/leave/types${toQueryString(query)}`),
  createLeaveType: (data: CreateLeaveTypeDto) =>
    request<LeaveTypeRecord>("/leave/types", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateLeaveType: (id: number, data: UpdateLeaveTypeDto) =>
    request<LeaveTypeRecord>(`/leave/types/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteLeaveType: (id: number) =>
    request<void>(`/leave/types/${id}`, {
      method: "DELETE",
    }),

  listLeaveCredits: (query: Partial<ListLeaveCreditsQuery> = {}) =>
    request<PaginatedResponse<EmployeeLeaveCreditRecord>>(`/leave/credits${toQueryString(query)}`),
  upsertLeaveCredit: (data: UpsertLeaveCreditDto) =>
    request<EmployeeLeaveCreditRecord>("/leave/credits", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  bulkAllocateLeaveCredits: (data: BulkAllocateLeaveCreditsDto) =>
    request<BulkAllocateCreditsResult>("/leave/credits/bulk", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getLeaveCreditLogs: (creditId: number) =>
    request<LeaveCreditLogRecord[]>(`/leave/credits/${creditId}/logs`),

  listLeaveApplications: (query: Partial<ListLeaveApplicationsQuery> = {}) =>
    request<PaginatedResponse<LeaveApplicationRecord>>(
      `/leave/applications${toQueryString(query)}`,
    ),
  getLeaveApplication: (id: number) => request<LeaveApplicationRecord>(`/leave/applications/${id}`),
  getLeaveAttachmentUrl: (id: number) =>
    `${webEnv.VITE_API_URL}/leave/applications/${id}/attachment`,
  createLeaveApplication: async (
    payload: CreateLeaveApplicationDto,
    file?: File | null,
  ): Promise<LeaveApplicationRecord> => {
    if (!file) {
      return request<LeaveApplicationRecord>("/leave/applications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    formData.append("file", file);
    const res = await fetch(`${webEnv.VITE_API_URL}/leave/applications`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string | string[];
        code?: string;
        applicationType?: ApplicationType;
      } | null;
      const message = Array.isArray(body?.message)
        ? body.message.join(", ")
        : (body?.message ?? `Request failed with status ${res.status}`);
      throw new ApiError(message, res.status, undefined, body?.code, body?.applicationType);
    }
    return (await res.json()) as LeaveApplicationRecord;
  },
  approveLeaveApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<LeaveApplicationRecord>(`/leave/applications/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  disapproveLeaveApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<LeaveApplicationRecord>(`/leave/applications/${id}/disapprove`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  cancelLeaveApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<LeaveApplicationRecord>(`/leave/applications/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Official Business & WFH (Module 13)
  getOfficialBusinessContext: () =>
    request<OfficialBusinessFilingContext>("/official-business/context"),
  listOfficialBusinessApplications: (query: Partial<ListOfficialBusinessApplicationsQuery> = {}) =>
    request<PaginatedResponse<OfficialBusinessApplicationRecord>>(
      `/official-business${toQueryString(query)}`,
    ),
  getOfficialBusinessApplication: (id: number) =>
    request<OfficialBusinessApplicationRecord>(`/official-business/${id}`),
  createOfficialBusinessApplications: (data: CreateOfficialBusinessApplicationDto) =>
    request<CreateOfficialBusinessBatchResult>("/official-business", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  approveOfficialBusinessApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<OfficialBusinessApplicationRecord>(`/official-business/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  disapproveOfficialBusinessApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<OfficialBusinessApplicationRecord>(`/official-business/${id}/disapprove`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  cancelOfficialBusinessApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<OfficialBusinessApplicationRecord>(`/official-business/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Attendance Corrections (Module 14)
  getCorrectionContext: () => request<CorrectionFilingContext>("/corrections/context"),
  previewCorrectionLogs: (params: { employeeId?: string; date: string }) =>
    request<CorrectionLogPreviewResponse>(`/corrections/preview${toQueryString(params)}`),
  listCorrectionApplications: (query: Partial<ListCorrectionApplicationsQuery> = {}) =>
    request<PaginatedResponse<CorrectionApplicationRecord>>(`/corrections${toQueryString(query)}`),
  getCorrectionApplication: (id: number) =>
    request<CorrectionApplicationRecord>(`/corrections/${id}`),
  createCorrectionApplication: (data: CreateCorrectionApplicationDto) =>
    request<CorrectionApplicationRecord>("/corrections", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  approveCorrectionApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<CorrectionApplicationRecord>(`/corrections/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  disapproveCorrectionApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<CorrectionApplicationRecord>(`/corrections/${id}/disapprove`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  cancelCorrectionApplication: (id: number, data: DecisionRemarksDto = {}) =>
    request<CorrectionApplicationRecord>(`/corrections/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
