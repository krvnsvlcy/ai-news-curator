export interface Attribution {
  name: string;
  /** Only http(s) URLs; otherwise the name shows as plain text. */
  url?: string;
}

/** "Built by …" credit from ATTRIBUTION_NAME / ATTRIBUTION_URL. Null when no name is set. Server-only. */
export function getAttribution(): Attribution | null {
  const name = process.env.ATTRIBUTION_NAME?.trim();
  if (!name) return null;
  const url = process.env.ATTRIBUTION_URL?.trim();
  return { name, url: url && /^https?:\/\//i.test(url) ? url : undefined };
}
