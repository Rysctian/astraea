import { zodResolver } from "@hookform/resolvers/zod";
import type {
  CreateRoleDto,
  MenuCatalogGroup,
  RoleDetailRecord,
  RoleGrantInput,
  UpdateRoleDto,
} from "@starter/shared";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

const roleHeaderSchema = z.object({
  name: z.string().trim().min(1, "Role name is required").max(100),
  code: z
    .string()
    .trim()
    .min(1, "Role code is required")
    .max(100)
    .regex(
      /^[a-z][a-z0-9_]*$/,
      "Must start with a lowercase letter and use only lowercase letters, numbers, and underscores",
    ),
});

type RoleHeaderValues = z.infer<typeof roleHeaderSchema>;

interface GrantFlags {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

const EMPTY_FLAGS: GrantFlags = {
  canView: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
};

function buildInitialGrantMap(role: RoleDetailRecord | null): Record<number, GrantFlags> {
  const map: Record<number, GrantFlags> = {};
  if (!role) {
    return map;
  }
  for (const g of role.grants) {
    map[g.menuId] = {
      canView: g.canView,
      canCreate: g.canCreate,
      canUpdate: g.canUpdate,
      canDelete: g.canDelete,
    };
  }
  return map;
}

export function RoleDrawer({
  open,
  onOpenChange,
  role,
  menuGroups,
  isLoadingDetail,
  isPending,
  serverError,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleDetailRecord | null;
  menuGroups: MenuCatalogGroup[];
  isLoadingDetail: boolean;
  isPending: boolean;
  serverError: string | null;
  onCreate: (payload: CreateRoleDto) => void;
  onUpdate: (id: number, payload: UpdateRoleDto) => void;
}) {
  const isEdit = role !== null;

  const initialHeader = useMemo<RoleHeaderValues>(
    () => ({
      name: role?.name ?? "",
      code: role?.code ?? "",
    }),
    [role],
  );

  const form = useForm<RoleHeaderValues>({
    values: initialHeader,
    resolver: zodResolver(roleHeaderSchema) as never,
  });

  const [grantMap, setGrantMap] = useState<Record<number, GrantFlags>>(() =>
    buildInitialGrantMap(role),
  );

  const toggleFlag = (menuId: number, flag: keyof GrantFlags, checked: boolean) => {
    setGrantMap((prev) => {
      const current = prev[menuId] ?? EMPTY_FLAGS;
      if (flag === "canView") {
        // Unchecking view automatically clears all write checkboxes
        return {
          ...prev,
          [menuId]: checked
            ? { ...current, canView: true }
            : { canView: false, canCreate: false, canUpdate: false, canDelete: false },
        };
      }
      // Checking any write action automatically checks view
      return {
        ...prev,
        [menuId]: {
          ...current,
          [flag]: checked,
          canView: checked ? true : current.canView,
        },
      };
    });
  };

  const setGroupAll = (group: MenuCatalogGroup, enabled: boolean) => {
    setGrantMap((prev) => {
      const next = { ...prev };
      for (const item of group.items) {
        next[item.id] = {
          canView: enabled,
          canCreate: enabled,
          canUpdate: enabled,
          canDelete: enabled,
        };
      }
      return next;
    });
  };

  const onSubmit = form.handleSubmit((header) => {
    const grants: RoleGrantInput[] = [];
    for (const group of menuGroups) {
      for (const item of group.items) {
        const flags = grantMap[item.id];
        if (flags && (flags.canView || flags.canCreate || flags.canUpdate || flags.canDelete)) {
          grants.push({
            menuId: item.id,
            canView: flags.canView,
            canCreate: flags.canCreate,
            canUpdate: flags.canUpdate,
            canDelete: flags.canDelete,
          });
        }
      }
    }

    if (isEdit && role) {
      onUpdate(role.id, { name: header.name.trim(), grants });
    } else {
      onCreate({
        name: header.name.trim(),
        code: header.code.trim().toLowerCase(),
        grants,
      });
    }
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent size="xl">
        <DrawerHeader>
          <DrawerTitle>{isEdit ? `Edit Role: ${role.name}` : "New Role & Permissions"}</DrawerTitle>
          <DrawerDescription>
            Configure per-module View, Create, Update, and Delete permissions across active HRIS
            menus.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {serverError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            ) : null}

            {/* Role Identity */}
            <section className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="role-name" className="text-xs font-medium text-foreground">
                  Role Name <span className="text-destructive">*</span>
                </label>
                <Input id="role-name" placeholder="e.g. HR Operations" {...form.register("name")} />
                {form.formState.errors.name ? (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="role-code" className="text-xs font-medium text-foreground">
                  Role Code <span className="text-destructive">*</span>
                </label>
                <Input
                  id="role-code"
                  placeholder="e.g. hr_ops"
                  disabled={isEdit}
                  className="font-mono"
                  {...form.register("code")}
                />
                {isEdit ? (
                  <p className="text-[10px] text-muted-foreground">
                    Role code is immutable after creation.
                  </p>
                ) : form.formState.errors.code ? (
                  <p className="text-[11px] text-destructive">
                    {form.formState.errors.code.message}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    Lowercase letters, numbers, and underscores only.
                  </p>
                )}
              </div>
            </section>

            {/* Permission Matrix */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                    Menu Permission Matrix
                  </h3>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Enabling any write action automatically enables View
                </span>
              </div>

              {isLoadingDetail ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-12 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Loading permissions...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {menuGroups.map((group) => (
                    <div
                      key={group.parentCode ?? "general"}
                      className="overflow-hidden rounded-lg border border-border bg-card"
                    >
                      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                        <span className="text-xs font-semibold text-foreground">
                          {group.parentTitle}
                        </span>
                        <div className="flex items-center gap-2 text-[11px]">
                          <button
                            type="button"
                            className="cursor-pointer font-medium text-primary hover:underline"
                            onClick={() => setGroupAll(group, true)}
                          >
                            Grant all
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            className="cursor-pointer text-muted-foreground hover:text-foreground"
                            onClick={() => setGroupAll(group, false)}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="divide-y divide-border/70">
                        <div className="grid grid-cols-[1fr_repeat(4,68px)] items-center bg-muted/15 px-4 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                          <span>Module / Menu</span>
                          <span className="text-center">View</span>
                          <span className="text-center">Create</span>
                          <span className="text-center">Update</span>
                          <span className="text-center">Delete</span>
                        </div>

                        {group.items.map((item) => {
                          const flags = grantMap[item.id] ?? EMPTY_FLAGS;
                          return (
                            <div
                              key={item.id}
                              className="grid grid-cols-[1fr_repeat(4,68px)] items-center px-4 py-2.5 text-xs transition-colors hover:bg-muted/20"
                            >
                              <div className="min-w-0 pr-2">
                                <p className="truncate font-medium text-foreground">{item.title}</p>
                                <Badge
                                  variant="neutral"
                                  className="mt-0.5 px-1.5 py-0 font-mono text-[10px]"
                                >
                                  {item.code}
                                </Badge>
                              </div>

                              <div className="flex justify-center">
                                <Checkbox
                                  aria-label={`${item.title} View`}
                                  checked={flags.canView}
                                  onCheckedChange={(c) => toggleFlag(item.id, "canView", c)}
                                />
                              </div>
                              <div className="flex justify-center">
                                <Checkbox
                                  aria-label={`${item.title} Create`}
                                  checked={flags.canCreate}
                                  onCheckedChange={(c) => toggleFlag(item.id, "canCreate", c)}
                                />
                              </div>
                              <div className="flex justify-center">
                                <Checkbox
                                  aria-label={`${item.title} Update`}
                                  checked={flags.canUpdate}
                                  onCheckedChange={(c) => toggleFlag(item.id, "canUpdate", c)}
                                />
                              </div>
                              <div className="flex justify-center">
                                <Checkbox
                                  aria-label={`${item.title} Delete`}
                                  checked={flags.canDelete}
                                  onCheckedChange={(c) => toggleFlag(item.id, "canDelete", c)}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <DrawerFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending || isLoadingDetail}>
              {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {isEdit ? "Save Role & Permissions" : "Create Role"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
