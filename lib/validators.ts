import { z } from "zod";
import { FEATURE_STATUSES, PROJECT_STATUSES } from "@/db/schema";

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
});

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

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type FeatureCreateInput = z.infer<typeof featureCreateSchema>;
export type FeatureUpdateInput = z.infer<typeof featureUpdateSchema>;
