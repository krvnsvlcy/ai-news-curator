"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass } from "@/components/button-styles";
import { SubmitButton } from "@/components/submit-button";
import type { SourceFormState, SourceFormValues } from "./form-values";

const INTERVALS = [5, 15, 30, 60, 180, 360, 720, 1440];

const inputClass =
  "mt-1.5 block w-full rounded-md border border-rule bg-paper px-3 py-1.5 text-[14px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-ink aria-[invalid=true]:border-danger";

export function SourceForm({
  action,
  initial,
  submitLabel,
}: {
  action: (prev: SourceFormState, fd: FormData) => Promise<SourceFormState>;
  initial: SourceFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, { values: initial });
  const v = state.values;
  const e = state.errors ?? {};
  const [kind, setKind] = useState(v.kind);

  return (
    <form
      action={formAction}
      className="overflow-hidden rounded-lg border border-rule bg-paper"
      noValidate
    >
      <div className="space-y-6 p-5 sm:p-6">
        {e.form && (
          <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-danger">
            {e.form}
          </p>
        )}

        <Field label="Name" name="name" error={e.name}>
          <input
            id="name"
            name="name"
            defaultValue={v.name}
            required
            className={inputClass}
            aria-invalid={!!e.name}
          />
        </Field>

        <Field
          label="Slug"
          name="slug"
          error={e.slug}
          hint="Used in URLs. Leave blank to generate it from the name."
        >
          <input
            id="slug"
            name="slug"
            defaultValue={v.slug}
            className={inputClass}
            aria-invalid={!!e.slug}
          />
        </Field>

        <Field label="Description" name="description" error={e.description} optional>
          <input
            id="description"
            name="description"
            defaultValue={v.description}
            className={inputClass}
          />
        </Field>

        <fieldset>
          <legend className="text-[13px] font-medium">Type</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <KindOption
              value="feed"
              checked={kind === "feed"}
              onSelect={setKind}
              title="RSS / Atom feed"
              detail="Any public RSS 2.0 or Atom URL."
            />
            <KindOption
              value="guardian"
              checked={kind === "guardian"}
              onSelect={setKind}
              title="Guardian Content API"
              detail="Needs GUARDIAN_API_KEY on the server."
            />
          </div>
        </fieldset>

        {kind === "feed" ? (
          <Field label="Feed URL" name="url" error={e.url}>
            <input
              id="url"
              name="url"
              type="url"
              inputMode="url"
              defaultValue={v.url}
              placeholder="https://example.com/feed.xml"
              className={inputClass}
              aria-invalid={!!e.url}
            />
          </Field>
        ) : (
          <div className="space-y-6">
            <Field
              label="Sections"
              name="section"
              error={e.section}
              optional
              hint='Guardian section ids. Separate with "|" to include several, e.g. politics|uk-news.'
            >
              <input id="section" name="section" defaultValue={v.section} className={inputClass} />
            </Field>
            <Field
              label="Search query"
              name="query"
              error={e.query}
              optional
              hint="Supports AND, OR and NOT."
            >
              <input id="query" name="query" defaultValue={v.query} className={inputClass} />
            </Field>
            <Field label="Articles per fetch" name="pageSize" error={e.pageSize}>
              <input
                id="pageSize"
                name="pageSize"
                type="number"
                min={1}
                max={200}
                defaultValue={v.pageSize}
                className={`${inputClass} max-w-32`}
                aria-invalid={!!e.pageSize}
              />
            </Field>
          </div>
        )}

        <Field label="Fetch" name="fetchIntervalMinutes" error={e.fetchIntervalMinutes}>
          <select
            id="fetchIntervalMinutes"
            name="fetchIntervalMinutes"
            defaultValue={v.fetchIntervalMinutes}
            className={`${inputClass} max-w-56`}
          >
            {INTERVALS.map((m) => (
              <option key={m} value={m}>
                {m < 60
                  ? `Every ${m} minutes`
                  : m === 60
                    ? "Every hour"
                    : m < 1440
                      ? `Every ${m / 60} hours`
                      : "Once a day"}
              </option>
            ))}
          </select>
        </Field>

        <label className="flex items-center gap-2.5 text-[14px]">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={v.enabled}
            className="size-4 accent-primary"
          />
          Enabled
        </label>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-rule bg-canvas px-5 py-3 sm:px-6">
        <Link href="/settings/sources" className={buttonClass("quiet")}>
          Cancel
        </Link>
        <SubmitButton pendingText="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-[13px] font-medium">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">optional</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      )}
    </div>
  );
}

function KindOption({
  value,
  checked,
  onSelect,
  title,
  detail,
}: {
  value: SourceFormValues["kind"];
  checked: boolean;
  onSelect: (k: SourceFormValues["kind"]) => void;
  title: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-md border border-rule p-3.5 transition-colors has-checked:border-ink has-checked:bg-canvas">
      <input
        type="radio"
        name="kind"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="mt-1 accent-primary"
      />
      <span>
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{detail}</span>
      </span>
    </label>
  );
}
