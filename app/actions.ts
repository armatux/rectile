"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import type { Feature } from "@/db/schema";
import {
  addFeature,
  addLink,
  addLogEntry,
  ConflictError,
  createProject,
  deleteFeature,
  deleteLink,
  deleteLogEntry,
  deleteProject,
  ForbiddenError,
  NotFoundError,
  reorderFeatures,
  setProjectTags,
  updateFeature,
  updateProject,
} from "@/lib/repo";
import { addTicketEvent, updateTicket } from "@/lib/tickets";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  featureCreateSchema,
  linkCreateSchema,
  logCreateSchema,
  projectCreateSchema,
  projectUpdateSchema,
} from "@/lib/validators";

function revalidateProject(slug: string) {
  revalidatePath("/");
  revalidatePath("/stale");
  revalidatePath(`/p/${slug}`);
}

export async function actionCreateProject(formData: FormData) {
  const tagsRaw = String(formData.get("tags") ?? "");
  const input = projectCreateSchema.parse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? "") || undefined,
    category: String(formData.get("category") ?? "") || undefined,
    priority: formData.get("priority") ?? undefined,
    status: String(formData.get("status") ?? "") || undefined,
    tags: tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined,
  });
  const project = await createProject(input);
  revalidateProject(project.slug);
  redirect(`/p/${project.slug}`);
}

export async function actionUpdateProject(
  slug: string,
  patch: Record<string, unknown>,
) {
  const input = projectUpdateSchema.parse(patch);
  const project = await updateProject(slug, input);
  revalidateProject(slug);
  return { ok: true as const, slug: project.slug };
}

export async function actionDeleteProject(slug: string) {
  await deleteProject(slug);
  revalidatePath("/");
  revalidatePath("/stale");
  redirect("/");
}

export async function actionSetTags(slug: string, names: string[]) {
  const p = await db.query.projects.findFirst({ where: eq(projects.slug, slug) });
  if (!p) throw new Error(`project not found: ${slug}`);
  await setProjectTags(
    p.id,
    names.map((n) => n.trim()).filter(Boolean).slice(0, 20),
  );
  revalidateProject(slug);
  return { ok: true as const };
}

export async function actionAddFeature(
  slug: string,
  title: string,
  status?: Feature["status"],
) {
  const input = featureCreateSchema.parse({ title, status });
  const feature = await addFeature(slug, input);
  revalidateProject(slug);
  return { ok: true as const, feature };
}

export async function actionMoveFeature(
  slug: string,
  featureId: number,
  status: Feature["status"],
  orderedIds?: number[],
) {
  await updateFeature(featureId, { status });
  if (orderedIds?.length) await reorderFeatures(slug, status, orderedIds);
  revalidateProject(slug);
  return { ok: true as const };
}

export async function actionReorderColumn(
  slug: string,
  status: Feature["status"],
  orderedIds: number[],
) {
  await reorderFeatures(slug, status, orderedIds);
  revalidateProject(slug);
  return { ok: true as const };
}

export async function actionDeleteFeature(slug: string, featureId: number) {
  await deleteFeature(featureId);
  revalidateProject(slug);
  return { ok: true as const };
}

export async function actionAddLog(slug: string, body: string) {
  const input = logCreateSchema.parse({ body });
  const logEntry = await addLogEntry(slug, input.body);
  revalidateProject(slug);
  return { ok: true as const, logEntry };
}

export async function actionDeleteLog(slug: string, id: number) {
  await deleteLogEntry(id);
  revalidateProject(slug);
  return { ok: true as const };
}

export async function actionAddLink(slug: string, label: string, url: string) {
  const input = linkCreateSchema.parse({ label, url });
  const link = await addLink(slug, input);
  revalidateProject(slug);
  return { ok: true as const, link };
}

export async function actionDeleteLink(slug: string, id: number) {
  await deleteLink(id);
  revalidateProject(slug);
  return { ok: true as const };
}

/* ---------------------------------- tickets --------------------------------- */

// The browser UI sits behind Cloudflare Access, so ticket actions act as
// the owner ("human"). Expected failures come back as values so the client
// can show them (thrown errors are redacted in production builds).

export type TicketActionResult = { ok: true } | { ok: false; error: string };

const ticketDecisionSchema = z.object({
  status: z.enum(["approved", "changes_requested", "cancelled"]),
  version: z.number().int().min(1),
  note: z.string().trim().max(20_000).optional(),
});

async function ticketAction(
  key: string,
  run: () => Promise<unknown>,
): Promise<TicketActionResult> {
  try {
    await run();
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues[0]?.message ?? "invalid input" };
    }
    if (
      err instanceof ConflictError ||
      err instanceof ForbiddenError ||
      err instanceof NotFoundError
    ) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${key}`);
  return { ok: true };
}

export async function actionCommentTicket(key: string, body: string) {
  return ticketAction(key, async () => {
    const text = z.string().trim().min(1).max(100_000).parse(body);
    await addTicketEvent("human", key, { type: "comment", body: text });
  });
}

/** Approve / request changes / cancel — `version` is the one the page showed. */
export async function actionDecideTicket(
  key: string,
  decision: { status: string; version: number; note?: string },
) {
  return ticketAction(key, async () => {
    const { status, version, note } = ticketDecisionSchema.parse(decision);
    await updateTicket("human", key, { status, version, note: note || undefined });
  });
}
