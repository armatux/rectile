import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { middleware } from "../middleware";

const URL = "http://localhost/api/v1/projects";
const TOKEN = "test-token-1234567890";

function req(headers: Record<string, string> = {}) {
  return new NextRequest(URL, { headers });
}

describe("API auth middleware", () => {
  const original = process.env.API_TOKEN;
  beforeEach(() => {
    process.env.API_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env.API_TOKEN = original;
  });

  it("rejects requests without an Authorization header", async () => {
    const res = await middleware(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    const body = await res.json();
    expect(body.error).toMatch(/unauthorized/);
  });

  it("rejects a wrong token", async () => {
    const res = await middleware(req({ authorization: "Bearer wrong-token" }));
    expect(res.status).toBe(401);
  });

  it("rejects a token that is a prefix of the real one", async () => {
    const res = await middleware(
      req({ authorization: `Bearer ${TOKEN.slice(0, -1)}` }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects malformed Authorization schemes", async () => {
    for (const value of [`Token ${TOKEN}`, TOKEN, "Bearer", "Bearer "]) {
      const res = await middleware(req({ authorization: value }));
      expect(res.status, `scheme: ${value}`).toBe(401);
    }
  });

  it("returns 503 when API_TOKEN is not configured", async () => {
    delete process.env.API_TOKEN;
    const res = await middleware(req({ authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(503);
  });

  it("lets a valid bearer token through", async () => {
    const res = await middleware(req({ authorization: `Bearer ${TOKEN}` }));
    // NextResponse.next() marks pass-through with this header
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("accepts case-insensitive scheme and surrounding whitespace", async () => {
    const res = await middleware(req({ authorization: `bearer  ${TOKEN} ` }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
