import { z } from "zod";
import {
  docCreateSchema,
  docUpdateSchema,
  eventCreateSchema,
  featureStatusSchema,
  featureUpdateSchema,
  linkCreateSchema,
  linkUpdateSchema,
  logCreateSchema,
  projectCreateSchema,
  projectUpdateSchema,
  repeatSchema,
} from "@/lib/validators";

/** kv keys the browser is allowed to write via the ops queue */
export const CLIENT_KV_KEYS = ["calendar_subscriptions", "app_launcher"] as const;

/**
 * Operations the offline write queue can capture and replay.
 *
 * Client-created entities get negative temp ids (-Date.now()); ops that
 * reference them carry the temp id and the replay endpoint remaps it to
 * the real id once the corresponding *.add op has been applied.
 */

const slug = z.string().trim().min(1).max(240);
const id = z.number().int();

export const opSchema = z.discriminatedUnion("kind", [
  projectCreateSchema.extend({ kind: z.literal("project.create") }),
  z.object({ kind: z.literal("project.update"), slug, patch: projectUpdateSchema }),
  z.object({ kind: z.literal("tags.set"), slug, names: z.array(z.string().trim().min(1).max(50)).max(20) }),
  z.object({
    kind: z.literal("feature.add"),
    slug,
    title: z.string().trim().min(1).max(300),
    status: featureStatusSchema.optional(),
    tempId: z.number().int().negative().optional(),
  }),
  z.object({
    kind: z.literal("feature.move"),
    slug,
    id,
    status: featureStatusSchema,
    orderedIds: z.array(id).max(500).optional(),
  }),
  z.object({ kind: z.literal("feature.delete"), slug, id }),
  z.object({
    kind: z.literal("feature.update"),
    slug,
    id,
    patch: featureUpdateSchema.omit({ status: true, sortOrder: true }),
  }),
  logCreateSchema.extend({
    kind: z.literal("log.add"),
    slug,
    tempId: z.number().int().negative().optional(),
  }),
  z.object({ kind: z.literal("log.delete"), slug, id }),
  z.object({
    kind: z.literal("log.update"),
    slug,
    id,
    body: z.string().trim().min(1).max(20_000),
  }),
  linkCreateSchema.extend({
    kind: z.literal("link.add"),
    slug,
    tempId: z.number().int().negative().optional(),
  }),
  z.object({ kind: z.literal("link.delete"), slug, id }),
  z.object({ kind: z.literal("link.update"), slug, id, patch: linkUpdateSchema }),
  docCreateSchema.extend({
    kind: z.literal("doc.add"),
    slug,
    tempId: z.number().int().negative().optional(),
  }),
  z.object({ kind: z.literal("doc.update"), slug, id, patch: docUpdateSchema }),
  z.object({ kind: z.literal("doc.delete"), slug, id }),
  eventCreateSchema.extend({
    kind: z.literal("event.add"),
    startsAt: z.string(), // ISO — Dates don't survive IndexedDB→JSON round-trips
    endsAt: z.string().optional(),
    tempId: z.number().int().negative().optional(),
  }),
  z.object({ kind: z.literal("event.delete"), id }),
  z.object({
    kind: z.literal("event.update"),
    id,
    patch: z
      .object({
        title: z.string().trim().min(1).max(300),
        notes: z.string().max(5_000).nullable(),
        startsAt: z.string(), // ISO — Dates don't survive IndexedDB→JSON round-trips
        endsAt: z.string().nullable(),
        allDay: z.boolean(),
      })
      .partial(),
  }),
  z.object({
    kind: z.literal("reminder.add"),
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(5_000).optional(),
    dueAt: z.string().optional(), // ISO — Dates don't survive IndexedDB→JSON round-trips
    repeat: z.enum(["daily", "weekly", "monthly", "yearly"]).optional(),
    projectSlug: z.string().trim().min(1).max(240).optional(),
    tempId: z.number().int().negative().optional(),
  }),
  z.object({ kind: z.literal("reminder.toggle"), id, done: z.boolean() }),
  z.object({ kind: z.literal("reminder.delete"), id }),
  z.object({
    kind: z.literal("reminder.update"),
    id,
    patch: z
      .object({
        title: z.string().trim().min(1).max(300),
        notes: z.string().max(5_000).nullable(),
        dueAt: z.string().nullable(), // ISO
        repeat: repeatSchema.nullable(),
      })
      .partial(),
  }),
  z.object({
    kind: z.literal("kv.set"),
    key: z.enum(CLIENT_KV_KEYS),
    value: z.unknown(),
  }),
]);

export const opsBatchSchema = z.object({ ops: z.array(opSchema).max(500) });

export type Op = z.infer<typeof opSchema>;
export type OpResult = { ok: boolean; error?: string };
