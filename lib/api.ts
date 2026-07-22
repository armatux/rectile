import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConflictError, NotFoundError } from "./repo";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Uniform error mapping for all /api/v1 route handlers. */
export function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return json(
      {
        error: "validation failed",
        issues: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }
  if (err instanceof NotFoundError) return json({ error: err.message }, 404);
  if (err instanceof ConflictError) return json({ error: err.message }, 409);
  if (err instanceof SyntaxError) {
    return json({ error: "invalid JSON body" }, 400);
  }
  console.error("[api]", err);
  return json({ error: "internal server error" }, 500);
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new NotFoundError(`invalid id: ${raw}`);
  }
  return id;
}
