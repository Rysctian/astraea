import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateUserDto, createUserSchema } from "@starter/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export function UserCreateDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateUserDto>({
    defaultValues: { name: "", email: "" },
    resolver: zodResolver(createUserSchema),
  });

  const createMutation = useMutation({
    mutationFn: api.createUser,
    onSuccess: async () => {
      form.reset();
      setServerError(null);
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: Error) => {
      setServerError(err.message);
    },
  });

  const onSubmit = form.handleSubmit((data) => {
    setServerError(null);
    createMutation.mutate(data);
  });

  const { errors } = form.formState;

  return (
    <Drawer
      direction="right"
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setServerError(null);
          form.clearErrors();
        }
        onOpenChange(next);
      }}
    >
      <DrawerContent className="max-w-md">
        <DrawerHeader>
          <DrawerTitle>Create User</DrawerTitle>
          <DrawerDescription>
            Add a new user record to the Astraea HRIS workspace directory.
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DrawerBody>
            {serverError ? (
              <div
                role="alert"
                className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {serverError}
              </div>
            ) : null}

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="user-name">Name</FieldLabel>
                <Input
                  id="user-name"
                  placeholder="Alice Smith"
                  aria-invalid={Boolean(errors.name)}
                  {...form.register("name")}
                />
                <FieldError message={errors.name?.message} />
              </Field>

              <Field>
                <FieldLabel htmlFor="user-email">Email</FieldLabel>
                <Input
                  id="user-email"
                  type="email"
                  placeholder="alice@example.com"
                  aria-invalid={Boolean(errors.email)}
                  {...form.register("email")}
                />
                <FieldError message={errors.email?.message} />
              </Field>
            </FieldGroup>
          </DrawerBody>

          <DrawerFooter className="justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Saving...</span>
                </>
              ) : (
                "Add User"
              )}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
