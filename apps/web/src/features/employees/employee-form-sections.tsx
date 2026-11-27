import { HRIS_REFERENCES } from "@starter/shared";
import { type UseFormReturn, useWatch } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { EmployeeFormTab, EmployeeFormValues } from "./employee-utils";

export function EmployeeFormSections({
  tab,
  form,
  disabled = false,
  supervisors = [],
  excludeEmployeeId,
}: {
  tab: EmployeeFormTab;
  form: UseFormReturn<EmployeeFormValues>;
  disabled?: boolean;
  supervisors?: Array<{ employeeId: string; firstName: string; lastName: string }>;
  excludeEmployeeId?: string;
}) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;

  const [office, department, division, educationalAttainment, separationType, languages] = useWatch(
    {
      control,
      name: [
        "office",
        "department",
        "division",
        "educationalAttainment",
        "separationType",
        "languages",
      ],
    },
  );

  const offices = Object.keys(HRIS_REFERENCES.orgHierarchy);
  const departments = office ? Object.keys(HRIS_REFERENCES.orgHierarchy[office] ?? {}) : [];
  const divisions =
    office && department
      ? Object.keys(HRIS_REFERENCES.orgHierarchy[office]?.[department] ?? {})
      : [];
  const sections =
    office && department && division
      ? (HRIS_REFERENCES.orgHierarchy[office]?.[department]?.[division] ?? [])
      : [];

  const degreeCourses = educationalAttainment
    ? (HRIS_REFERENCES.degreeCoursesByAttainment[educationalAttainment] ?? [])
    : [];
  const separationReasons = separationType
    ? (HRIS_REFERENCES.separationReasonsByType[separationType] ?? [])
    : [];

  const availableSupervisors = supervisors.filter((s) => s.employeeId !== excludeEmployeeId);
  const selectedLanguages = languages ?? [];

  if (tab === "personal") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="emp-first-name">First Name *</FieldLabel>
          <Input
            id="emp-first-name"
            disabled={disabled}
            aria-invalid={Boolean(errors.firstName)}
            placeholder="Maria"
            {...register("firstName")}
          />
          <FieldError message={errors.firstName?.message} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-middle-name">Middle Name</FieldLabel>
          <Input
            id="emp-middle-name"
            disabled={disabled}
            placeholder="Clara"
            {...register("middleName")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-last-name">Last Name *</FieldLabel>
          <Input
            id="emp-last-name"
            disabled={disabled}
            aria-invalid={Boolean(errors.lastName)}
            placeholder="Santos"
            {...register("lastName")}
          />
          <FieldError message={errors.lastName?.message} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-name-ext">Name Extension</FieldLabel>
          <Input
            id="emp-name-ext"
            disabled={disabled}
            placeholder="Jr., Sr., III"
            {...register("nameExtension")}
          />
        </Field>

        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="emp-personal-email">Personal Email (Login Email) *</FieldLabel>
          <Input
            id="emp-personal-email"
            type="email"
            disabled={disabled}
            aria-invalid={Boolean(errors.personalEmail)}
            placeholder="maria.santos@company.com"
            {...register("personalEmail")}
          />
          <FieldDescription>
            Used to atomically provision and sync the employee&apos;s HRIS login account.
          </FieldDescription>
          <FieldError message={errors.personalEmail?.message} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-birth-date">Birth Date</FieldLabel>
          <Input
            id="emp-birth-date"
            type="date"
            disabled={disabled}
            aria-invalid={Boolean(errors.birthDate)}
            {...register("birthDate")}
          />
          <FieldError message={errors.birthDate?.message} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-birth-place">Birth Place</FieldLabel>
          <Input
            id="emp-birth-place"
            disabled={disabled}
            placeholder="Manila, Philippines"
            {...register("birthPlace")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-gender">Gender</FieldLabel>
          <Select id="emp-gender" disabled={disabled} {...register("gender")}>
            <option value="">Select gender</option>
            {HRIS_REFERENCES.genders.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-civil-status">Civil Status</FieldLabel>
          <Select id="emp-civil-status" disabled={disabled} {...register("civilStatus")}>
            <option value="">Select civil status</option>
            {HRIS_REFERENCES.civilStatuses.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-blood-type">Blood Type</FieldLabel>
          <Select id="emp-blood-type" disabled={disabled} {...register("bloodType")}>
            <option value="">Select blood type</option>
            {HRIS_REFERENCES.bloodTypes.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-nationality">Nationality</FieldLabel>
          <Input
            id="emp-nationality"
            disabled={disabled}
            placeholder="Filipino"
            {...register("nationality")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-mobile">Mobile Number</FieldLabel>
          <Input
            id="emp-mobile"
            disabled={disabled}
            placeholder="+63 917 000 0000"
            {...register("mobileNo")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-telephone">Telephone Number</FieldLabel>
          <Input id="emp-telephone" disabled={disabled} {...register("telephoneNo")} />
        </Field>

        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="emp-address">Current Address</FieldLabel>
          <Input
            id="emp-address"
            disabled={disabled}
            placeholder="Street, City, Province"
            {...register("currentAddress")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-ec-name">Emergency Contact Name</FieldLabel>
          <Input id="emp-ec-name" disabled={disabled} {...register("emergencyContactName")} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-ec-rel">Relationship</FieldLabel>
          <Select id="emp-ec-rel" disabled={disabled} {...register("emergencyContactRelationship")}>
            <option value="">Select relationship</option>
            {HRIS_REFERENCES.relationships.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-ec-no">Emergency Contact No.</FieldLabel>
          <Input id="emp-ec-no" disabled={disabled} {...register("emergencyContactNo")} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-religion">Religion</FieldLabel>
          <Input id="emp-religion" disabled={disabled} {...register("religion")} />
        </Field>
      </div>
    );
  }

  if (tab === "education") {
    const attainmentField = register("educationalAttainment", {
      onChange: () => {
        setValue("degreeCourse", "");
      },
    });

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="emp-attainment">Educational Attainment</FieldLabel>
          <Select id="emp-attainment" disabled={disabled} {...attainmentField}>
            <option value="">Select attainment</option>
            {HRIS_REFERENCES.educationalAttainments.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-degree">Degree / Course</FieldLabel>
          <Select
            id="emp-degree"
            disabled={disabled || !educationalAttainment}
            {...register("degreeCourse")}
          >
            <option value="">
              {educationalAttainment
                ? "Select degree or course"
                : "Select educational attainment first"}
            </option>
            {degreeCourses.map((course) => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </Select>
        </Field>

        <Field className="sm:col-span-2">
          <FieldLabel>Spoken Languages</FieldLabel>
          <div className="flex flex-wrap gap-2 pt-1">
            {HRIS_REFERENCES.languages.map((lang) => {
              const selected = selectedLanguages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const next = selected
                      ? selectedLanguages.filter((item) => item !== lang)
                      : [...selectedLanguages, lang];
                    setValue("languages", next, { shouldDirty: true });
                  }}
                  className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-country">Country</FieldLabel>
          <Input
            id="emp-country"
            disabled={disabled}
            placeholder="Philippines"
            {...register("country")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-citizenship">Citizenship</FieldLabel>
          <Input
            id="emp-citizenship"
            disabled={disabled}
            placeholder="Filipino"
            {...register("citizenship")}
          />
        </Field>
      </div>
    );
  }

  if (tab === "employment") {
    const officeField = register("office", {
      onChange: () => {
        setValue("department", "");
        setValue("division", "");
        setValue("section", "");
      },
    });
    const departmentField = register("department", {
      onChange: () => {
        setValue("division", "");
        setValue("section", "");
      },
    });
    const divisionField = register("division", {
      onChange: () => {
        setValue("section", "");
      },
    });
    const separationTypeField = register("separationType", {
      onChange: () => {
        setValue("separationReason", "");
      },
    });

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="emp-office">Office / Branch</FieldLabel>
          <Select id="emp-office" disabled={disabled} {...officeField}>
            <option value="">Select office</option>
            {offices.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-department">Department</FieldLabel>
          <Select id="emp-department" disabled={disabled || !office} {...departmentField}>
            <option value="">{office ? "Select department" : "Select office first"}</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-division">Division</FieldLabel>
          <Select id="emp-division" disabled={disabled || !department} {...divisionField}>
            <option value="">{department ? "Select division" : "Select department first"}</option>
            {divisions.map((div) => (
              <option key={div} value={div}>
                {div}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-section">Section / Unit</FieldLabel>
          <Select id="emp-section" disabled={disabled || !division} {...register("section")}>
            <option value="">{division ? "Select section" : "Select division first"}</option>
            {sections.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-position">Position</FieldLabel>
          <Select id="emp-position" disabled={disabled} {...register("position")}>
            <option value="">Select position</option>
            {HRIS_REFERENCES.positions.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-reports-to">Reports To (Supervisor)</FieldLabel>
          <Select
            id="emp-reports-to"
            disabled={disabled}
            aria-invalid={Boolean(errors.reportsToEmployeeId)}
            {...register("reportsToEmployeeId")}
          >
            <option value="">None</option>
            {availableSupervisors.map((sup) => (
              <option key={sup.employeeId} value={sup.employeeId}>
                {sup.employeeId} — {sup.firstName} {sup.lastName}
              </option>
            ))}
          </Select>
          <FieldError message={errors.reportsToEmployeeId?.message} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-status">Employment Status</FieldLabel>
          <Select id="emp-status" disabled={disabled} {...register("employmentStatus")}>
            {HRIS_REFERENCES.employmentStatuses.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-type">Employee Type</FieldLabel>
          <Select id="emp-type" disabled={disabled} {...register("type")}>
            {HRIS_REFERENCES.employeeTypes.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-work-arrangement">Work Arrangement</FieldLabel>
          <Select id="emp-work-arrangement" disabled={disabled} {...register("workArrangement")}>
            <option value="">Select arrangement</option>
            {HRIS_REFERENCES.workArrangements.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-category">Employee Category</FieldLabel>
          <Select id="emp-category" disabled={disabled} {...register("employeeCategory")}>
            <option value="">Select category</option>
            {HRIS_REFERENCES.employeeCategories.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-appointment">Appointment Type</FieldLabel>
          <Select id="emp-appointment" disabled={disabled} {...register("appointmentType")}>
            <option value="">Select appointment</option>
            {HRIS_REFERENCES.appointmentTypes.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-work-email">Work Email</FieldLabel>
          <Input
            id="emp-work-email"
            type="email"
            disabled={disabled}
            aria-invalid={Boolean(errors.workEmail)}
            placeholder="maria@astraea.local"
            {...register("workEmail")}
          />
          <FieldError message={errors.workEmail?.message} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-date-hired">Date Hired</FieldLabel>
          <Input
            id="emp-date-hired"
            type="date"
            disabled={disabled}
            aria-invalid={Boolean(errors.dateHired)}
            {...register("dateHired")}
          />
          <FieldError message={errors.dateHired?.message} />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-reg-date">Regularization Date</FieldLabel>
          <Input
            id="emp-reg-date"
            type="date"
            disabled={disabled}
            {...register("regularizationDate")}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-sep-type">Separation Type</FieldLabel>
          <Select id="emp-sep-type" disabled={disabled} {...separationTypeField}>
            <option value="">None (Active)</option>
            {HRIS_REFERENCES.separationTypes.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-sep-reason">Separation Reason</FieldLabel>
          <Select
            id="emp-sep-reason"
            disabled={disabled || !separationType}
            {...register("separationReason")}
          >
            <option value="">
              {separationType ? "Select separation reason" : "Select separation type first"}
            </option>
            {separationReasons.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="emp-sep-date">Separation Date</FieldLabel>
          <Input
            id="emp-sep-date"
            type="date"
            disabled={disabled}
            {...register("separationDate")}
          />
        </Field>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="emp-tin">TIN Number</FieldLabel>
        <Input
          id="emp-tin"
          disabled={disabled}
          placeholder="000-000-000-000"
          {...register("tinNo")}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="emp-sss">SSS Number</FieldLabel>
        <Input id="emp-sss" disabled={disabled} placeholder="00-0000000-0" {...register("sssNo")} />
      </Field>

      <Field>
        <FieldLabel htmlFor="emp-philhealth">PhilHealth Number</FieldLabel>
        <Input
          id="emp-philhealth"
          disabled={disabled}
          placeholder="00-000000000-0"
          {...register("philhealthNo")}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="emp-pagibig">Pag-IBIG Number</FieldLabel>
        <Input
          id="emp-pagibig"
          disabled={disabled}
          placeholder="0000-0000-0000"
          {...register("pagibigNo")}
        />
      </Field>
    </div>
  );
}
