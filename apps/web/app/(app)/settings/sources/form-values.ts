import type { SourceDoc, SourceKind } from "@curator/db";

/** Flat, serializable form values shared by the client form and server actions. */
export interface SourceFormValues {
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  fetchIntervalMinutes: number;
  kind: SourceKind;
  url: string;
  section: string;
  query: string;
  pageSize: number;
}

export interface SourceFormState {
  values: SourceFormValues;
  /** Keyed by form field name. */
  errors?: Partial<Record<keyof SourceFormValues | "form", string>>;
}

export const EMPTY_SOURCE: SourceFormValues = {
  name: "",
  slug: "",
  description: "",
  enabled: true,
  fetchIntervalMinutes: 30,
  kind: "feed",
  url: "",
  section: "",
  query: "",
  pageSize: 50,
};

export function valuesFromSource(s: SourceDoc): SourceFormValues {
  return {
    name: s.name,
    slug: s.slug,
    description: s.description ?? "",
    enabled: s.enabled,
    fetchIntervalMinutes: s.fetchIntervalMinutes,
    kind: s.config.kind,
    url: s.config.kind === "feed" ? s.config.url : "",
    section: s.config.kind === "guardian" ? (s.config.section ?? "") : "",
    query: s.config.kind === "guardian" ? (s.config.query ?? "") : "",
    pageSize: s.config.kind === "guardian" ? s.config.pageSize : 50,
  };
}
