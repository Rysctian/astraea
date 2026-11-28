import type { CreateManualLogDto, ImportLogsRowError } from "@starter/shared";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimePicker } from "@/components/ui/time-picker";
import { type ApiEmployee, ApiError, api } from "@/lib/api";
import { getTodayIso } from "./attendance-utils";

type DrawerTab = "manual" | "import";

export function LogEntryDrawer({
  open,
  onOpenChange,
  employees,
  defaultEmployeeId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: ApiEmployee[];
  defaultEmployeeId: string;
  onSaved: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<DrawerTab>("manual");
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || employees[0]?.employeeId || "");
  const [date, setDate] = useState(getTodayIso);
  const [deviceId, setDeviceId] = useState("");
  const [amIn, setAmIn] = useState("08:00");
  const [amOut, setAmOut] = useState("");
  const [pmIn, setPmIn] = useState("");
  const [pmOut, setPmOut] = useState("17:00");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importRowErrors, setImportRowErrors] = useState<ImportLogsRowError[]>([]);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const manualMutation = useMutation({
    mutationFn: (payload: CreateManualLogDto) => api.createManualLogs(payload),
    onError: (err: Error) => {
      setManualSuccess(null);
      setManualError(err.message);
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importAttendanceLogs(file),
    onSuccess: async (res) => {
      setImportError(null);
      setImportRowErrors([]);
      setSelectedFile(null);
      setImportSuccess(
        `Processed ${res.totalRows} row(s): inserted ${res.insertedCount} punch(es), skipped ${res.skippedCount} duplicate(s).`,
      );
      await onSaved();
    },
    onError: (err: Error) => {
      setImportSuccess(null);
      setImportError(err.message);
      if (err instanceof ApiError && err.rowErrors) {
        setImportRowErrors(err.rowErrors);
      } else {
        setImportRowErrors([]);
      }
    },
  });

  const submitManual = (keepOpen: boolean) => {
    setManualError(null);
    setManualSuccess(null);
    if (!employeeId) {
      setManualError("Select an employee first.");
      return;
    }
    if (!date) {
      setManualError("Log date is required.");
      return;
    }
    if (!amIn && !amOut && !pmIn && !pmOut) {
      setManualError("Enter at least one punch time (AM In, AM Out, PM In, or PM Out).");
      return;
    }
    manualMutation.mutate(
      {
        employeeId,
        date,
        deviceId: deviceId.trim() || undefined,
        amIn: amIn || undefined,
        amOut: amOut || undefined,
        pmIn: pmIn || undefined,
        pmOut: pmOut || undefined,
      },
      {
        onSuccess: async (res) => {
          setManualError(null);
          await onSaved();
          if (keepOpen) {
            setManualSuccess(
              `Saved ${res.insertedCount} punch${res.insertedCount === 1 ? "" : "es"}${res.skippedCount > 0 ? ` (${res.skippedCount} duplicate skipped)` : ""}. Ready for next entry.`,
            );
          } else {
            onOpenChange(false);
          }
        },
      },
    );
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="lg">
        <DrawerHeader>
          <DrawerTitle>Add / Import Attendance Logs</DrawerTitle>
          <DrawerDescription>
            Record manual AM/PM punches for an employee or bulk-upload a validated spreadsheet.
          </DrawerDescription>

          <div className="mt-4">
            <TabsList aria-label="Log entry modes">
              <TabsTrigger active={tab === "manual"} onClick={() => setTab("manual")}>
                Manual Log Time
              </TabsTrigger>
              <TabsTrigger active={tab === "import"} onClick={() => setTab("import")}>
                Upload Spreadsheet
              </TabsTrigger>
            </TabsList>
          </div>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {tab === "manual" ? (
              <>
                {manualError ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                  >
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{manualError}</span>
                  </div>
                ) : null}

                {manualSuccess ? (
                  <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{manualSuccess}</span>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label htmlFor="man-emp" className="text-xs font-medium text-foreground">
                      Employee <span className="text-destructive">*</span>
                    </label>
                    <SelectMenu
                      id="man-emp"
                      placeholder="Select employee..."
                      value={employeeId}
                      onValueChange={setEmployeeId}
                      options={employees.map((e) => ({
                        value: e.employeeId,
                        label: `${e.firstName} ${e.lastName} (${e.employeeId})`,
                      }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="man-date" className="text-xs font-medium text-foreground">
                      Log Date <span className="text-destructive">*</span>
                    </label>
                    <DatePicker id="man-date" allowClear={false} value={date} onChange={setDate} />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="man-device" className="text-xs font-medium text-foreground">
                      Device / Label
                    </label>
                    <Input
                      id="man-device"
                      placeholder="MANUAL-ENTRY"
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    AM / PM Punch Times
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor="man-amin" className="text-xs font-medium text-foreground">
                        AM Time In
                      </label>
                      <TimePicker
                        id="man-amin"
                        allowClear
                        placeholder="Optional"
                        value={amIn}
                        onChange={setAmIn}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="man-amout" className="text-xs font-medium text-foreground">
                        AM Time Out
                      </label>
                      <TimePicker
                        id="man-amout"
                        allowClear
                        placeholder="Optional"
                        value={amOut}
                        onChange={setAmOut}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="man-pmin" className="text-xs font-medium text-foreground">
                        PM Time In
                      </label>
                      <TimePicker
                        id="man-pmin"
                        allowClear
                        placeholder="Optional"
                        value={pmIn}
                        onChange={setPmIn}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="man-pmout" className="text-xs font-medium text-foreground">
                        PM Time Out
                      </label>
                      <TimePicker
                        id="man-pmout"
                        allowClear
                        placeholder="Optional"
                        value={pmOut}
                        onChange={setPmOut}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">
                      Standard Import Template (.xlsx)
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Columns: Date, Employee ID, AM Time In, AM Time Out, PM Time In, PM Time Out.
                    </p>
                  </div>
                  <a
                    href={api.getAttendanceTemplateUrl()}
                    download="attendance-logs-template.xlsx"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:bg-accent"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download Template</span>
                  </a>
                </div>

                {importError ? (
                  <div
                    role="alert"
                    className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                  >
                    <div className="flex items-start gap-2">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="font-medium">{importError}</span>
                    </div>
                    {importRowErrors.length > 0 ? (
                      <ul className="max-h-40 space-y-1 overflow-y-auto pl-5 list-disc text-[11px]">
                        {importRowErrors.map((e) => (
                          <li key={`${e.row}-${e.message}`}>
                            Row {e.row}: {e.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {importSuccess ? (
                  <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{importSuccess}</span>
                  </div>
                ) : null}

                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/15 px-6 py-10 text-center">
                  <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">
                      {selectedFile
                        ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                        : "Select a spreadsheet file (.xlsx, .xls, or .csv — max 10 MB)"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      All rows are validated upfront; invalid files abort atomically without partial
                      writes.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setSelectedFile(f);
                      setImportError(null);
                      setImportRowErrors([]);
                      setImportSuccess(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {selectedFile ? "Choose Different File" : "Browse File"}
                  </Button>
                </div>
              </>
            )}
          </div>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={manualMutation.isPending || importMutation.isPending}
            >
              Close
            </Button>

            {tab === "manual" ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={manualMutation.isPending}
                  onClick={() => submitManual(true)}
                >
                  Save &amp; Add Another
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={manualMutation.isPending}
                  onClick={() => submitManual(false)}
                >
                  {manualMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Save Log
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={!selectedFile || importMutation.isPending}
                onClick={() => {
                  if (selectedFile) {
                    importMutation.mutate(selectedFile);
                  }
                }}
              >
                {importMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Upload Logs
              </Button>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
