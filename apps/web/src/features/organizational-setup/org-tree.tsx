import type { OrgHierarchyTree, OrgTreeDepartmentNode, OrgTreeOfficeNode } from "@starter/shared";
import { Building2, FolderTree, GitBranch, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function DepartmentBranch({ dept }: { dept: OrgTreeDepartmentNode }) {
  return (
    <li className="list-none space-y-1.5">
      <div className="flex items-center gap-2 rounded-md border border-border/80 bg-card px-3 py-2 text-xs">
        <Layers className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
        <span className="font-mono text-[11px] text-muted-foreground">{dept.code}</span>
        <span className="font-medium text-foreground">{dept.name}</span>
        {!dept.isActive ? <Badge variant="neutral">Inactive</Badge> : null}
      </div>

      {dept.divisions.length > 0 || dept.sections.length > 0 ? (
        <ul className="ml-5 space-y-1.5 border-l border-border pl-3">
          {dept.divisions.map((div) => (
            <li key={div.id} className="list-none space-y-1">
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs">
                <GitBranch className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                <span className="font-mono text-[11px] text-muted-foreground">{div.code}</span>
                <span className="text-foreground">{div.name}</span>
                {!div.isActive ? <Badge variant="neutral">Inactive</Badge> : null}
              </div>
              {div.sections.length > 0 ? (
                <ul className="ml-4 space-y-1 border-l border-border pl-3">
                  {div.sections.map((sec) => (
                    <li
                      key={sec.id}
                      className="flex list-none items-center gap-2 py-1 text-xs text-muted-foreground"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                        aria-hidden="true"
                      />
                      <span className="font-mono text-[11px]">{sec.code}</span>
                      <span className="text-foreground">{sec.name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
          {dept.sections.map((sec) => (
            <li
              key={`direct-${sec.id}`}
              className="flex list-none items-center gap-2 py-1 text-xs text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="font-mono text-[11px]">{sec.code}</span>
              <span className="text-foreground">{sec.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function OfficeBranch({ office }: { office: OrgTreeOfficeNode }) {
  return (
    <li className="list-none space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-xs">
        <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="font-mono text-[11px] font-medium text-primary">{office.code}</span>
        <span className="font-semibold text-foreground">{office.name}</span>
        <Badge variant="blue">{office.type}</Badge>
        {!office.isActive ? <Badge variant="neutral">Inactive</Badge> : null}
      </div>

      {office.children.length > 0 || office.departments.length > 0 ? (
        <ul className="ml-5 space-y-2 border-l border-border pl-4">
          {office.children.map((child) => (
            <OfficeBranch key={child.id} office={child} />
          ))}
          {office.departments.map((dept) => (
            <DepartmentBranch key={dept.id} dept={dept} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function OrgHierarchyTreeView({ tree }: { tree: OrgHierarchyTree }) {
  const isEmpty = tree.offices.length === 0 && tree.unassignedDepartments.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center border-t border-border py-16 text-center">
        <FolderTree className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-foreground">No hierarchy nodes yet</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Create offices, departments, divisions, and sections to visualize the institutional tree.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-border px-6 py-5">
      {tree.offices.length > 0 ? (
        <ul className="space-y-3">
          {tree.offices.map((office) => (
            <OfficeBranch key={office.id} office={office} />
          ))}
        </ul>
      ) : null}

      {tree.unassignedDepartments.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Unassigned Departments
          </p>
          <ul className="space-y-2">
            {tree.unassignedDepartments.map((dept) => (
              <DepartmentBranch key={dept.id} dept={dept} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
