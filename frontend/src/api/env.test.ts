import { describe, expect, it } from "vitest";

import { requireApiBaseUrl } from "./env";

describe("requireApiBaseUrl", () => {
  it("rejects a missing value with a clear configuration error", () => {
    expect(() => requireApiBaseUrl(undefined)).toThrow(
      /VITE_API_BASE_URL is required and must be an absolute http\(s\) URL/,
    );
  });

  it("rejects a blank or non-http value", () => {
    expect(() => requireApiBaseUrl("   ")).toThrow(/VITE_API_BASE_URL/);
    expect(() => requireApiBaseUrl("not-a-url")).toThrow(/VITE_API_BASE_URL/);
    expect(() => requireApiBaseUrl("ftp://files.example")).toThrow(/VITE_API_BASE_URL/);
  });

  it("returns a normalized absolute URL without a trailing slash", () => {
    expect(requireApiBaseUrl("http://127.0.0.1:8000/")).toBe("http://127.0.0.1:8000");
    expect(requireApiBaseUrl("https://api.example.test")).toBe("https://api.example.test");
  });
});
