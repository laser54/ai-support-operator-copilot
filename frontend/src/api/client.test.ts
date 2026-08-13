import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./client";

describe("createApiClient", () => {
  it("GET returns JSON from the configured API base URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ case_id: "abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    await expect(client.get("/cases/abc")).resolves.toEqual({ case_id: "abc" });
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:8000/cases/abc", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("throws ApiError from a machine-readable envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "not_found", message: "case not found" } }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:8000",
      fetchImpl,
    });

    const error = await client.get("/cases/missing").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: "not_found",
      message: "case not found",
    });
  });
});
