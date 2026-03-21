/**
 * Standardized API error handling.
 *
 * Provides consistent error response format across all API routes:
 * { error: string, code?: string, details?: unknown }
 */

import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  toResponse(): NextResponse {
    const body: Record<string, unknown> = { error: this.message };
    if (this.code) body.code = this.code;
    if (this.details) body.details = this.details;
    return NextResponse.json(body, { status: this.statusCode });
  }
}

// Common error factories
export const Errors = {
  unauthorized: (msg = "Unauthorized. Provide X-API-Key header.") =>
    new ApiError(msg, 401, "UNAUTHORIZED"),

  forbidden: (msg = "Forbidden.") => new ApiError(msg, 403, "FORBIDDEN"),

  notFound: (resource = "Resource") =>
    new ApiError(`${resource} not found.`, 404, "NOT_FOUND"),

  badRequest: (msg: string, details?: unknown) =>
    new ApiError(msg, 400, "BAD_REQUEST", details),

  conflict: (msg: string) => new ApiError(msg, 409, "CONFLICT"),

  internal: (msg = "Internal server error.") =>
    new ApiError(msg, 500, "INTERNAL_ERROR"),

  relayError: (msg: string) =>
    new ApiError(msg, 502, "RELAY_ERROR"),

  paymentError: (msg: string) =>
    new ApiError(msg, 502, "PAYMENT_ERROR"),
} as const;

/**
 * Wrap an API handler with standardized error handling.
 *
 * Usage:
 *   export const POST = withErrorHandler(async (request) => { ... });
 */
export function withErrorHandler(
  handler: (request: Request) => Promise<NextResponse>
) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof ApiError) {
        return error.toResponse();
      }
      console.error("Unhandled API error:", error);
      return Errors.internal().toResponse();
    }
  };
}
