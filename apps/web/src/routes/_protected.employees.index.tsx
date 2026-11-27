import { createFileRoute } from "@tanstack/react-router";
import { EmployeeTablePage } from "@/features/employees/employee-table";

export const Route = createFileRoute("/_protected/employees/")({
  component: EmployeeTablePage,
});
