import { createFileRoute } from "@tanstack/react-router";
import { SchedulesPage } from "@/features/schedules/schedules-page";

export const Route = createFileRoute("/_protected/attendance/schedules")({
  component: SchedulesPage,
});
