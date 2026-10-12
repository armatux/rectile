import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { readActorHeaders, type ActorIdentity } from "./actor";
import { ConflictError, ForbiddenError, NotFoundError } from "./repo";

export class UnauthorizedError extends Error {}

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
  if (err instanceof UnauthorizedError) return json({ error: err.message }, 401);
  if (err instanceof ForbiddenError) return json({ error: err.message }, 403);
  if (err instanceof NotFoundError) return json({ error: err.message }, 404);
  if (err instanceof ConflictError) {
    return json({ error: err.message, ...err.details }, 409);
  }
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

/**
 * The caller's identity as resolved by middleware.ts. Never trusts the
 * client: the headers are overwritten by the middleware and HMAC-checked
 * here, so a request that bypassed the gate fails closed.
 */
export function requireActor(req: Request): ActorIdentity {
  const key = process.env.API_TOKEN;
  const identity = key ? readActorHeaders(req.headers, key) : null;
  if (!identity) {
    throw new UnauthorizedError("unauthorized: request did not pass the API gate");
  }
  return identity;
}

export function requireHuman(req: Request, action: string): ActorIdentity {
  const identity = requireActor(req);
  if (identity.actor !== "human") {
    throw new ForbiddenError(`forbidden: ${identity.actor} may not ${action}`);
  }
  return identity;
}
