import { describe, expect, it } from "vitest";

import { artifactTimestamp } from "./artifactTimestamp";

describe("artifactTimestamp", () => {
  it("formats timestamps to the catalog API's whole-second contract", () => {
    expect(artifactTimestamp(new Date("2026-08-13T09:45:28.123Z"))).toBe("2026-08-13T09:45:28Z");
  });
});
