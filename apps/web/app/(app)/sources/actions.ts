"use server";

import {
  createSource,
  DuplicateSlugError,
  deleteSource,
  getSource,
  type SourceInput,
  seedDefaultSources,
  setSourceEnabled,
  sourceInputSchema,
  updateSource,
} from "@curator/db";
import { ingestSource } from "@curator/ingest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import type { SourceFormState, SourceFormValues } from "./form-values";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function readForm(fd: FormData): SourceFormValues {
  const name = str(fd, "name");
  return {
    name,
    slug: str(fd, "slug") || slugify(name),
    description: str(fd, "description"),
    enabled: fd.get("enabled") === "on",
    fetchIntervalMinutes: Number(str(fd, "fetchIntervalMinutes")) || 30,
    kind: str(fd, "kind") === "guardian" ? "guardian" : "feed",
    url: str(fd, "url"),
    section: str(fd, "section"),
    query: str(fd, "query"),
    pageSize: Number(str(fd, "pageSize")) || 50,
  };
}

function toInput(v: SourceFormValues): SourceInput {
  return {
    name: v.name,
    slug: v.slug,
    description: v.description || undefined,
    enabled: v.enabled,
    fetchIntervalMinutes: v.fetchIntervalMinutes,
    config:
      v.kind === "feed"
        ? { kind: "feed", url: v.url }
        : {
            kind: "guardian",
            section: v.section || undefined,
            query: v.query || undefined,
            pageSize: v.pageSize,
          },
  };
}

// Maps schema paths (e.g. ["config", "url"]) to form field names.
function fieldFor(path: PropertyKey[]): keyof SourceFormValues | "form" {
  const last = String(path.at(-1) ?? "form");
  return (
    [
      "name",
      "slug",
      "description",
      "fetchIntervalMinutes",
      "url",
      "section",
      "query",
      "pageSize",
    ].includes(last)
      ? last
      : "form"
  ) as keyof SourceFormValues | "form";
}

function revalidate() {
  revalidatePath("/sources", "layout");
  revalidatePath("/");
}

export async function saveSource(
  id: string | null,
  _prev: SourceFormState,
  fd: FormData,
): Promise<SourceFormState> {
  await requireSession();
  const values = readForm(fd);

  const parsed = sourceInputSchema.safeParse(toInput(values));
  if (!parsed.success) {
    const errors: SourceFormState["errors"] = {};
    for (const issue of parsed.error.issues) errors[fieldFor(issue.path)] ??= issue.message;
    return { values, errors };
  }

  try {
    if (id) {
      if (!(await updateSource(id, parsed.data))) {
        return { values, errors: { form: "This source no longer exists." } };
      }
    } else {
      await createSource(parsed.data);
    }
  } catch (err) {
    if (err instanceof DuplicateSlugError) return { values, errors: { slug: err.message } };
    throw err;
  }

  revalidate();
  redirect("/sources");
}

export async function deleteSourceAction(id: string): Promise<void> {
  await requireSession();
  await deleteSource(id);
  revalidate();
  redirect("/sources");
}

export async function toggleSourceAction(id: string, enabled: boolean): Promise<void> {
  await requireSession();
  await setSourceEnabled(id, enabled);
  revalidate();
}

export async function fetchSourceNowAction(id: string): Promise<void> {
  await requireSession();
  const source = await getSource(id);
  if (!source) return;
  await ingestSource(source); // Outcome is recorded on the source and shown in the list.
  revalidate();
}

export async function seedDefaultsAction(): Promise<void> {
  await requireSession();
  await seedDefaultSources();
  revalidate();
}
