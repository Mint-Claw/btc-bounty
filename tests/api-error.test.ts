import { describe, it, expect } from "vitest";
import { ApiError, Errors, withErrorHandler } from "@/lib/server/api-error";
import { NextResponse } from "next/server";

describe("ApiError", () => {
  it("creates error with status code", () => {
    const err = new ApiError("test error", 400);
    expect(err.message).toBe("test error");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("ApiError");
  });

  it("produces JSON response", () => {
    const err = new ApiError("not found", 404, "NOT_FOUND");
    const response = err.toResponse();
    expect(response.status).toBe(404);
  });

  it("includes code and details when provided", () => {
    const err = new ApiError("bad", 400, "BAD_REQUEST", { field: "title" });
    const response = err.toResponse();
    expect(response.status).toBe(400);
  });
});

describe("Error factories", () => {
  it("unauthorized", () => {
    const err = Errors.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("notFound with resource name", () => {
    const err = Errors.notFound("Bounty");
    expect(err.message).toBe("Bounty not found.");
    expect(err.statusCode).toBe(404);
  });

  it("badRequest with details", () => {
    const err = Errors.badRequest("Invalid input", { field: "amount" });
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ field: "amount" });
  });

  it("relayError", () => {
    const err = Errors.relayError("Connection refused");
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe("RELAY_ERROR");
  });
});

describe("withErrorHandler", () => {
  it("passes through successful responses", async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ ok: true });
    });
    const response = await handler(new Request("http://localhost/api/test"));
    expect(response.status).toBe(200);
  });

  it("catches ApiError and returns formatted response", async () => {
    const handler = withErrorHandler(async () => {
      throw Errors.notFound("Bounty");
    });
    const response = await handler(new Request("http://localhost/api/test"));
    expect(response.status).toBe(404);
  });

  it("catches unknown errors as 500", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("unexpected");
    });
    const response = await handler(new Request("http://localhost/api/test"));
    expect(response.status).toBe(500);
  });
});
