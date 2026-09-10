import { NextResponse } from "next/server";

export const ErrorCode = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE: "UNPROCESSABLE",
  RATE_LIMITED: "RATE_LIMITED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_MAP: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function ok<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  const body: { data: T; meta?: Record<string, unknown> } = { data };
  if (meta) body.meta = meta;
  return NextResponse.json(body);
}

export function fail(
  code: ErrorCode,
  message: string,
  details?: unknown,
): NextResponse {
  const status = STATUS_MAP[code];
  const body: { error: { code: ErrorCode; message: string; details?: unknown } } = {
    error: { code, message },
  };
  if (details !== undefined) body.error.details = details;
  return NextResponse.json(body, { status });
}
