const REQUIRED_MESSAGE =
  "VITE_API_BASE_URL is required and must be an absolute http(s) URL";

export function requireApiBaseUrl(value: string | undefined): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(REQUIRED_MESSAGE);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(REQUIRED_MESSAGE);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(REQUIRED_MESSAGE);
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
}
