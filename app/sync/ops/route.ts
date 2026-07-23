import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { handleError, json } from "@/lib/api";
import { opsBatchSchema, type Op, type OpResult } from "@/lib/offline/ops";
import {
  addEvent,
  addFeature,
  addLink,
  addLogEntry,
  addReminder,
  createProject,
  deleteEvent,
  deleteFeature,
  deleteLink,
  deleteLogEntry,
  deleteReminder,
  reorderFeatures,
  setKv,
  setProjectTags,
  updateFeature,
  updateProject,
  updateReminder,
} from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Replay endpoint for the offline write queue (lib/offline/queue.ts).
 *
 * Deliberately OUTSIDE /api: in production Cloudflare Access guards it like
 * every UI page (only /api/* bypasses Access), and the browser calls it
 * same-origin with its Access cookie. The custom X-Rectile-Sync header
 * forces a CORS preflight, so cross-origin pages cannot invoke it.
 *
 * Ops apply in queue order. Entities created offline carry negative temp
 * ids; *.add ops declare them via tempId, later ops get them remapped.
 */

/** temp-id → real-id, kept per entity kind (temp ids may collide across kinds) */
type IdMaps = {
  feature: Map<number, number>;
  log: Map<number, number>;
  link: Map<number, number>;
  event: Map<number, number>;
  reminder: Map<number, number>;
};

function remap(map: Map<number, number>, id: number): number | null {
  const real = id < 0 ? map.get(id) : id;
  return real === undefined || real === null || real < 0 ? null : real;
}

async function applyOp(op: Op, ids: IdMaps): Promise<void> {
  switch (op.kind) {
    case "project.create": {
      const { kind, ...input } = op;
      void kind;
      await createProject(input);
      return;
    }
    case "project.update":
      await updateProject(op.slug, op.patch);
      return;
    case "tags.set": {
      const p = await db.query.projects.findFirst({ where: eq(projects.slug, op.slug) });
      if (!p) throw new Error(`project not found: ${op.slug}`);
      await setProjectTags(p.id, op.names);
      return;
    }
    case "feature.add": {
      const f = await addFeature(op.slug, { title: op.title, status: op.status });
      if (op.tempId) ids.feature.set(op.tempId, f.id);
      return;
    }
    case "feature.move": {
      const id = remap(ids.feature, op.id);
      if (id === null) throw new Error(`unknown temp feature id ${op.id}`);
      await updateFeature(id, { status: op.status });
      const ordered = op.orderedIds
        ?.map((x) => remap(ids.feature, x))
        .filter((x): x is number => x !== null);
      if (ordered?.length) await reorderFeatures(op.slug, op.status, ordered);
      return;
    }
    case "feature.delete": {
      const id = remap(ids.feature, op.id);
      if (id === null) throw new Error(`unknown temp feature id ${op.id}`);
      await deleteFeature(id);
      return;
    }
    case "log.add": {
      const l = await addLogEntry(op.slug, op.body);
      if (op.tempId) ids.log.set(op.tempId, l.id);
      return;
    }
    case "log.delete": {
      const id = remap(ids.log, op.id);
      if (id === null) throw new Error(`unknown temp log id ${op.id}`);
      await deleteLogEntry(id);
      return;
    }
    case "link.add": {
      const l = await addLink(op.slug, { label: op.label, url: op.url });
      if (op.tempId) ids.link.set(op.tempId, l.id);
      return;
    }
    case "link.delete": {
      const id = remap(ids.link, op.id);
      if (id === null) throw new Error(`unknown temp link id ${op.id}`);
      await deleteLink(id);
      return;
    }
    case "event.add": {
      const e = await addEvent({
        title: op.title,
        notes: op.notes,
        startsAt: new Date(op.startsAt),
        endsAt: op.endsAt ? new Date(op.endsAt) : undefined,
        allDay: op.allDay,
        remindBeforeMin: op.remindBeforeMin,
      });
      if (op.tempId) ids.event.set(op.tempId, e.id);
      return;
    }
    case "event.delete": {
      const id = remap(ids.event, op.id);
      if (id === null) throw new Error(`unknown temp event id ${op.id}`);
      await deleteEvent(id);
      return;
    }
    case "reminder.add": {
      const r = await addReminder({
        title: op.title,
        notes: op.notes,
        dueAt: op.dueAt ? new Date(op.dueAt) : null,
        repeat: op.repeat,
        projectSlug: op.projectSlug,
      });
      if (op.tempId) ids.reminder.set(op.tempId, r.id);
      return;
    }
    case "reminder.toggle": {
      const id = remap(ids.reminder, op.id);
      if (id === null) throw new Error(`unknown temp reminder id ${op.id}`);
      await updateReminder(id, { done: op.done });
      return;
    }
    case "reminder.delete": {
      const id = remap(ids.reminder, op.id);
      if (id === null) throw new Error(`unknown temp reminder id ${op.id}`);
      await deleteReminder(id);
      return;
    }
    case "kv.set":
      await setKv(op.key, op.value); // op.key is allowlisted by the schema
      return;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("x-rectile-sync") !== "1") {
      return json({ error: "missing sync header" }, 400);
    }
    const { ops } = opsBatchSchema.parse(await req.json());
    const ids: IdMaps = {
      feature: new Map(),
      log: new Map(),
      link: new Map(),
      event: new Map(),
      reminder: new Map(),
    };
    const results: OpResult[] = [];
    const touched = new Set<string>();

    for (const op of ops) {
      try {
        await applyOp(op, ids);
        if ("slug" in op) touched.add(op.slug);
        results.push({ ok: true });
      } catch (err) {
        results.push({ ok: false, error: String((err as Error)?.message ?? err) });
      }
    }

    revalidatePath("/");
    revalidatePath("/stale");
    revalidatePath("/calendar");
    revalidatePath("/reminders");
    for (const slug of touched) revalidatePath(`/p/${slug}`);
    return json({ results });
  } catch (err) {
    return handleError(err);
  }
}
