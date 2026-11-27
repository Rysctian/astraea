import { createFileRoute } from "@tanstack/react-router";
import { AttendancePoliciesPage } from "@/features/attendance-policies/policies-page";

export const Route = createFileRoute("/_protected/attendance/policies")({
  component: AttendancePoliciesPage,
});
