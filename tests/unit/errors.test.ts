import { describe, expect, it } from "vitest";
import { AppError, ErrorCode, ok, fail } from "@/lib/errors";

describe("AppError", () => {
  it("carries code and message", () => {
    const err = new AppError("NOT_FOUND", "resource missing");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("resource missing");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("ok", () => {
  it("wraps data in envelope", async () => {
    const res = ok({ id: "123" });
    const json = await res.json();
    expect(json).toEqual({ data: { id: "123" } });
    expect(res.status).toBe(200);
  });

  it("includes meta when provided", async () => {
    const res = ok([1, 2], { total: 2 });
    const json = await res.json();
    expect(json.meta).toEqual({ total: 2 });
  });
});

describe("fail", () => {
  it("returns correct status for VALIDATION_FAILED", async () => {
    const res = fail(ErrorCode.VALIDATION_FAILED, "bad input");
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns 404 for NOT_FOUND", async () => {
    const res = fail(ErrorCode.NOT_FOUND, "not found");
    expect(res.status).toBe(404);
  });

  it("returns 401 for UNAUTHENTICATED", async () => {
    const res = fail(ErrorCode.UNAUTHENTICATED, "no session");
    expect(res.status).toBe(401);
  });

  it("returns 403 for FORBIDDEN", async () => {
    const res = fail(ErrorCode.FORBIDDEN, "no access");
    expect(res.status).toBe(403);
  });

  it("returns 500 for INTERNAL", async () => {
    const res = fail(ErrorCode.INTERNAL, "server error");
    expect(res.status).toBe(500);
  });

  it("includes details when provided", async () => {
    const res = fail(ErrorCode.CONFLICT, "duplicate", { field: "sha256" });
    const json = await res.json();
    expect(json.error.details).toEqual({ field: "sha256" });
  });
});
