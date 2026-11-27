import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmployeeTablePage } from "./employee-table.js";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/employees/EMP-20260001" className={className}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

describe("EmployeeTablePage (Employee 201 + shadcn Drawer + RHF)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it("renders server-paginated Employee 201 rows and jumps to first error tab on invalid drawer submit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 1,
            employeeId: "EMP-20260001",
            type: "employee",
            office: "Head Office",
            department: "Engineering",
            division: "Platform Engineering",
            section: "Core API",
            position: "Software Engineer",
            reportsToEmployeeId: null,
            firstName: "Maria",
            middleName: null,
            lastName: "Santos",
            nameExtension: null,
            birthDate: null,
            birthPlace: null,
            gender: "FEMALE",
            civilStatus: "SINGLE",
            bloodType: null,
            country: null,
            nationality: null,
            citizenship: null,
            religion: null,
            disabilityType: null,
            educationalAttainment: null,
            degreeCourse: null,
            languages: ["English"],
            personalEmail: "maria.santos@example.com",
            mobileNo: "+63 917 111 2222",
            telephoneNo: null,
            currentAddress: null,
            emergencyContactName: null,
            emergencyContactRelationship: null,
            emergencyContactNo: null,
            employmentStatus: "ACTIVE",
            employeeCategory: "STAFF",
            appointmentType: "PERMANENT",
            employmentClassification: "FULL_TIME",
            workArrangement: "HYBRID",
            workEmail: "maria@astraea.local",
            dateHired: "2026-11-01",
            regularizationDate: null,
            separationType: null,
            separationReason: null,
            separationDate: null,
            tinNo: null,
            sssNo: null,
            philhealthNo: null,
            pagibigNo: null,
            createdAt: "2026-11-27T00:00:00.000Z",
            updatedAt: "2026-11-27T00:00:00.000Z",
          },
        ],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EmployeeTablePage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("EMP-20260001")).toBeInTheDocument();
    expect(screen.getByText("Maria Santos")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add employee/i }));
    const drawer = screen.getByRole("dialog");
    fireEvent.click(within(drawer).getByRole("tab", { name: /statutory ids/i }));
    expect(within(drawer).getByLabelText(/tin number/i)).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole("button", { name: /save employee/i }));

    expect(await within(drawer).findByText(/first name is required/i)).toBeInTheDocument();
    expect(within(drawer).getByLabelText(/personal info has errors/i)).toBeInTheDocument();
  });
});
