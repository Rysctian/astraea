import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { WorkspaceActionsProvider } from "@/lib/workspace-actions";
import { AttendancePage } from "./attendance-page";

vi.mock("@/lib/api", () => ({
  api: {
    listEmployees: vi.fn(),
    getCutOffPresets: vi.fn(),
    getDtr: vi.fn(),
    listAttendanceLogs: vi.fn(),
    createManualLogs: vi.fn(),
    importAttendanceLogs: vi.fn(),
    getAttendanceTemplateUrl: () => "/attendance/logs/template",
  },
}));

describe("AttendancePage (DTR + Manage In/Out)", () => {
  it("renders DTR KPI cards, table rows, and opens Add / Import Logs drawer", async () => {
    vi.mocked(api.listEmployees).mockResolvedValue({
      data: [
        {
          id: 1,
          employeeId: "EMP-20260001",
          type: "admin",
          office: null,
          department: null,
          division: null,
          section: null,
          position: null,
          reportsToEmployeeId: null,
          firstName: "Christian",
          middleName: null,
          lastName: "Reyes",
          nameExtension: null,
          birthDate: null,
          birthPlace: null,
          gender: null,
          civilStatus: null,
          bloodType: null,
          country: null,
          nationality: null,
          citizenship: null,
          religion: null,
          disabilityType: null,
          educationalAttainment: null,
          degreeCourse: null,
          languages: [],
          personalEmail: null,
          mobileNo: null,
          telephoneNo: null,
          currentAddress: null,
          emergencyContactName: null,
          emergencyContactRelationship: null,
          emergencyContactNo: null,
          employmentStatus: "ACTIVE",
          employeeCategory: null,
          appointmentType: null,
          employmentClassification: null,
          workArrangement: null,
          workEmail: "admin@astraea.local",
          dateHired: null,
          regularizationDate: null,
          separationType: null,
          separationReason: null,
          separationDate: null,
          tinNo: null,
          sssNo: null,
          philhealthNo: null,
          pagibigNo: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, pageSize: 100, totalPages: 1 },
    });
    vi.mocked(api.getCutOffPresets).mockResolvedValue([]);
    vi.mocked(api.getDtr).mockResolvedValue({
      employeeId: "EMP-20260001",
      employeeName: "Christian Reyes",
      from: "2026-11-01",
      to: "2026-11-28",
      summary: {
        totalRenderedSeconds: 32400,
        totalScheduledSeconds: 32400,
        presentDays: 1,
        absentDays: 0,
        totalTardySeconds: 0,
        totalUndertimeSeconds: 0,
      },
      rows: [
        {
          date: "2026-11-02",
          dayOfWeek: 1,
          codeDay: "M",
          scheduleId: 1,
          scheduleName: "Regular 8-5",
          timezone: "Asia/Manila",
          slotIndex: 0,
          schedStart: "08:00:00",
          schedEnd: "17:00:00",
          isOvernight: false,
          timeIn: "08:00:00",
          timeOut: "17:00:00",
          scheduledSeconds: 32400,
          renderedSeconds: 32400,
          tardySeconds: 0,
          undertimeSeconds: 0,
          absent: false,
          undertime: false,
          earlyDismiss: false,
          status: "present",
          remarks: "Present",
        },
      ],
    });
    vi.mocked(api.listAttendanceLogs).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 1 },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WorkspaceActionsProvider>
          <AttendancePage />
        </WorkspaceActionsProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("9.00 hrs")).toBeInTheDocument();
    expect(screen.getByText(/Nov 2, 2026/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add \/ import logs/i }));
    expect(await screen.findByText("Add / Import Attendance Logs")).toBeInTheDocument();
  });
});
