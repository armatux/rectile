/**
 * CRUD test for the /api/v1/projects route handlers, run against a real
 * Postgres (set DATABASE_URL; the suite is skipped without it).
 */
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("projects CRUD route", () => {
  afterAll(async () => {
    const { client } = await import("@/db");
    await client.end();
  });

  function jsonReq(method: string, body?: unknown) {
    return new NextRequest("http://localhost/api/v1/projects", {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("creates, reads, updates and deletes a project", async () => {
    const list = await import("@/app/api/v1/projects/route");
    const single = await import("@/app/api/v1/projects/[slug]/route");

    // create
    const created = await list.POST(
      jsonReq("POST", {
        name: "Vitest CRUD Probe",
        description: "temporary row created by the test suite",
        priority: 1,
        tags: ["vitest-probe"],
      }),
    );
    expect(created.status).toBe(201);
    const { project } = await created.json();
    expect(project.slug).toBe("vitest-crud-probe");
    expect(project.tags.map((t: { name: string }) => t.name)).toContain(
      "vitest-probe",
    );
    const params = Promise.resolve({ slug: project.slug });

    try {
      // read (list + detail)
      const listRes = await list.GET(jsonReq("GET"));
      expect(listRes.status).toBe(200);
      const listed = await listRes.json();
      expect(
        listed.projects.some((p: { slug: string }) => p.slug === project.slug),
      ).toBe(true);

      const detailRes = await single.GET(jsonReq("GET"), { params });
      expect(detailRes.status).toBe(200);

      // update
      const patched = await single.PATCH(
        jsonReq("PATCH", { status: "paused", priority: 3 }),
        { params },
      );
      expect(patched.status).toBe(200);
      const { project: updated } = await patched.json();
      expect(updated.status).toBe("paused");
      expect(updated.priority).toBe(3);

      // validation error
      const bad = await single.PATCH(jsonReq("PATCH", { priority: 99 }), {
        params,
      });
      expect(bad.status).toBe(400);
    } finally {
      // delete
      const deleted = await single.DELETE(jsonReq("DELETE"), { params });
      expect(deleted.status).toBe(200);
    }

    // gone
    const gone = await single.GET(jsonReq("GET"), { params });
    expect(gone.status).toBe(404);
  });

  it("returns 400 for an invalid create body", async () => {
    const list = await import("@/app/api/v1/projects/route");
    const res = await list.POST(jsonReq("POST", { priority: 9 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation failed");
  });

  it("returns 404 for an unknown slug", async () => {
    const single = await import("@/app/api/v1/projects/[slug]/route");
    const res = await single.GET(jsonReq("GET"), {
      params: Promise.resolve({ slug: "definitely-not-a-project" }),
    });
    expect(res.status).toBe(404);
  });
});
