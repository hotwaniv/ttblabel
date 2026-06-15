"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const APPLICATION_FORM_FIELDS = [
  { id: "brandName",      label: "Brand Name",         placeholder: "", priority: "core"      },
  { id: "alcoholContent", label: "Alcohol Content",    placeholder: "", priority: "core"      },
  { id: "classType",      label: "Class / Type",       placeholder: "", priority: "important" },
  { id: "netContents",    label: "Net Contents",       placeholder: "", priority: "important" },
  { id: "producerName",   label: "Producer / Bottler", placeholder: "", priority: "important" },
  { id: "beverageType",   label: "Beverage Type",      placeholder: "", priority: "optional"  },
] as const;

export type ApplicationFormFieldId =
  (typeof APPLICATION_FORM_FIELDS)[number]["id"];

export const emptyApplicationFormState: Record<ApplicationFormFieldId, string> =
  {
    brandName: "",
    classType: "",
    alcoholContent: "",
    netContents: "",
    producerName: "",
    beverageType: "",
  };

const GROUPS: {
  key: "core" | "important" | "optional";
  label: string;
  description: string;
}[] = [
  {
    key: "core",
    label: "Core Fields",
    description: "Required for every COLA submission",
  },
  {
    key: "important",
    label: "Important Fields",
    description: "Key label information verified against your application",
  },
  {
    key: "optional",
    label: "Optional Fields",
    description: "Supplementary information",
  },
];

function FieldInput({
  field,
  value,
  onChange,
  idPrefix,
}: {
  field: (typeof APPLICATION_FORM_FIELDS)[number];
  value: string;
  onChange: (id: ApplicationFormFieldId, value: string) => void;
  idPrefix: string;
}) {
  const fieldId = `${idPrefix}${field.id}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{field.label}</Label>
      <Input
        id={fieldId}
        name={field.id}
        onChange={(e) => onChange(field.id, e.target.value)}
        placeholder={field.placeholder}
        required={field.priority !== "optional"}
        value={value}
      />
    </div>
  );
}

export function ApplicationFieldsSection({
  values,
  onChange,
  idPrefix = "",
}: {
  values: Record<ApplicationFormFieldId, string>;
  onChange: (id: ApplicationFormFieldId, value: string) => void;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const groupFields = APPLICATION_FORM_FIELDS.filter(
          (f) => f.priority === group.key
        );

        return (
          <section
            className="rounded-xl border border-border bg-card p-6"
            key={group.key}
          >
            <div className="mb-4">
              <h2 className="font-medium text-base">{group.label}</h2>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {group.description}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {groupFields.map((field) => (
                <FieldInput
                  field={field}
                  idPrefix={idPrefix}
                  key={field.id}
                  onChange={onChange}
                  value={values[field.id]}
                />
              ))}
            </div>

            {group.key === "optional" ? (
              <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
                The TTB government warning is verified automatically against the
                mandated Surgeon General statement — it is not entered here.
              </p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function appendApplicationFields(
  formData: FormData,
  values: Record<ApplicationFormFieldId, string>
) {
  for (const field of APPLICATION_FORM_FIELDS) {
    formData.append(field.id, values[field.id]);
  }
}
