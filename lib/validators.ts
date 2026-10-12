import { z } from "zod";
import {
  ACTORS,
  FEATURE_STATUSES,
  PROJECT_STATUSES,
  TICKET_EVENT_TYPES,
  TICKET_KINDS,
  TICKET_MODES,
  TICKET_OWNERS,
  TICKET_SOURCES,
  TICKET_STATUSES,
} from "@/db/schema";

export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const featureStatusSchema = z.enum(FEATURE_STATUSES);

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).optional(),
  category: z.string().trim().max(100).optional(),
  status: projectStatusSchema.optional(),
  priority: z.coerce.number().int().min(1).max(3).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

export const projectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).nullable(),
    category: z.string().trim().max(100).nullable(),
    status: projectStatusSchema,
    priority: z.coerce.number().int().min(1).max(3),
    tags: z.array(z.string().trim().min(1).max(50)).max(20),
  })
  .partial();

export const featureCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).optional(),
  status: featureStatusSchema.optional(),
});

export const featureUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10_000).nullable(),
    status: featureStatusSchema,
    sortOrder: z.coerce.number().int(),
  })
  .partial();

export const logCreateSchema = z.object({
  body: z.string().trim().min(1).max(20_000),
});

export const linkCreateSchema = z.object({
  label: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
});

export const linkUpdateSchema = linkCreateSchema.partial();

export const eventCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(5_000).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  allDay: z.boolean().optional(),
  /** minutes of lead time — creates a linked reminder push before the event */
  remindBeforeMin: z.number().int().min(0).max(10_080).optional(),
});

export const eventUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(5_000).nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable(),
    allDay: z.boolean(),
  })
  .partial();

export const docCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(200_000).optional(),
});

export const docUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    body: z.string().max(200_000),
  })
  .partial();

export const repeatSchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

export const reminderCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(5_000).optional(),
  dueAt: z.coerce.date().optional(),
  repeat: repeatSchema.optional(),
  projectSlug: z.string().trim().min(1).max(240).optional(),
});

export const reminderUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    notes: z.string().max(5_000).nullable(),
    dueAt: z.coerce.date().nullable(),
    repeat: repeatSchema.nullable(),
    projectSlug: z.string().trim().min(1).max(240).nullable(),
    done: z.boolean(),
  })
  .partial();

export const tagCreateSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const tagUpdateSchema = tagCreateSchema.partial();

/* ---------------------------------- tickets --------------------------------- */

export const actorSchema = z.enum(ACTORS);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketOwnerSchema = z.enum(TICKET_OWNERS);

const ticketText = z.string().max(50_000);
const touchedPathsSchema = z.array(z.string().trim().min(1).max(1_000)).max(500);
const linkedContractsSchema = z
  .array(z.string().trim().regex(/^[^@\s]+@[^@\s]+$/, "expected id@version"))
  .max(200);
const modelSchema = z.string().trim().min(1).max(100);
const effortSchema = z.string().trim().min(1).max(50);

export const ticketCreateSchema = z.object({
  title: z.string().trim().min(1).max(300),
  ownerAgent: ticketOwnerSchema,
  description: ticketText.nullish(),
  kind: z.enum(TICKET_KINDS).optional(),
  source: z.enum(TICKET_SOURCES).optional(),
  priority: z.coerce.number().int().min(1).max(3).optional(),
  acceptanceCriteria: ticketText.nullish(),
  touchedPaths: touchedPathsSchema.optional(),
  linkedContracts: linkedContractsSchema.optional(),
  model: modelSchema.nullish(),
  effort: effortSchema.nullish(),
  mode: z.enum(TICKET_MODES).nullish(),
  status: ticketStatusSchema.optional(),
  projectSlug: z.string().trim().min(1).max(200).nullish(),
});

/** `version` is mandatory (optimistic concurrency); `note` feeds the
 *  approval/rejection/status_change event, it is not stored on the ticket. */
export const ticketPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: ticketText.nullable(),
    ownerAgent: ticketOwnerSchema,
    status: ticketStatusSchema,
    priority: z.coerce.number().int().min(1).max(3),
    acceptanceCriteria: ticketText.nullable(),
    touchedPaths: touchedPathsSchema,
    linkedContracts: linkedContractsSchema,
    model: modelSchema.nullable(),
    effort: effortSchema.nullable(),
    mode: z.enum(TICKET_MODES).nullable(),
    changelist: z.number().int().positive().nullable(),
    note: z.string().max(20_000),
  })
  .partial()
  .extend({ version: z.coerce.number().int().min(1) });

export const ticketEventCreateSchema = z.object({
  type: z.enum(TICKET_EVENT_TYPES),
  body: z.string().max(100_000),
  data: z.record(z.string(), z.unknown()).optional(),
});

/** Agents write these URLs and the owner's browser renders them as links;
 *  checked on the parsed protocol so `java\tscript:` can't slip through. */
const UNSAFE_PROTOCOLS = ["javascript:", "data:", "vbscript:"];
const attachmentUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_000)
  .refine((u) => {
    try {
      return !UNSAFE_PROTOCOLS.includes(new URL(u).protocol);
    } catch {
      return false;
    }
  }, "unsafe URL scheme");

export const ticketAttachmentCreateSchema = z.object({
  label: z.string().trim().min(1).max(300),
  url: attachmentUrlSchema,
  sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "expected 64 hex chars")
    .transform((s) => s.toLowerCase()),
  contentType: z.string().trim().min(1).max(200).nullish(),
  sizeBytes: z.number().int().min(0).nullish(),
});

export const ticketListQuerySchema = z.object({
  since_seq: z.coerce.number().int().min(0).optional(),
  status: ticketStatusSchema.optional(),
  owner: ticketOwnerSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  updated_since: z.coerce.date().optional(),
});

export const ticketEventsQuerySchema = z.object({
  after_id: z.coerce.number().int().min(0).optional(),
});

export const ticketEventFeedQuerySchema = z.object({
  after_id: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(1_000).default(200),
});

export const tokenCreateSchema = z.object({
  actor: actorSchema,
  name: z.string().trim().min(1).max(100),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type FeatureCreateInput = z.infer<typeof featureCreateSchema>;
export type FeatureUpdateInput = z.infer<typeof featureUpdateSchema>;
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;
export type TicketPatchInput = z.infer<typeof ticketPatchSchema>;
export type TicketEventCreateInput = z.infer<typeof ticketEventCreateSchema>;
export type TicketAttachmentCreateInput = z.infer<typeof ticketAttachmentCreateSchema>;
