/**
 * Zod schemas for API request validation.
 *
 * Centralizes all input validation to prevent malformed data from
 * reaching business logic or the Nostr relay layer.
 */

import { z } from "zod";

const BOUNTY_CATEGORIES = [
  "code",
  "design",
  "writing",
  "research",
  "testing",
  "devops",
  "security",
  "other",
] as const;

export const CreateBountySchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be under 200 characters"),
  summary: z.string().max(500).optional().default(""),
  content: z
    .string()
    .min(10, "Content must be at least 10 characters")
    .max(10000, "Content must be under 10,000 characters"),
  rewardSats: z
    .number()
    .int("Reward must be a whole number")
    .min(1000, "Minimum reward is 1,000 sats")
    .max(100_000_000, "Maximum reward is 1 BTC"),
  category: z.enum(BOUNTY_CATEGORIES).optional().default("other"),
  lightning: z
    .string()
    .min(1, "Lightning address is required")
    .refine(
      (val) => val.includes("@") || val.startsWith("lnurl") || val.startsWith("lnbc"),
      "Must be a valid Lightning address, LNURL, or invoice"
    ),
  tags: z.array(z.string().max(50)).max(10).optional().default([]),
  expiry: z
    .number()
    .int()
    .min(Math.floor(Date.now() / 1000))
    .optional(),
  image: z.string().url("Image must be a valid URL").optional(),
  escrow: z.boolean().optional().default(false),
});

export const UpdateBountyStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  winner: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const SubmitWorkSchema = z.object({
  bountyDTag: z.string().min(1, "Bounty ID is required"),
  content: z
    .string()
    .min(10, "Submission must be at least 10 characters")
    .max(50000),
  proofUrl: z.string().url("Proof URL must be valid").optional(),
});

export type CreateBountyInput = z.infer<typeof CreateBountySchema>;
export type UpdateBountyStatusInput = z.infer<typeof UpdateBountyStatusSchema>;
export type SubmitWorkInput = z.infer<typeof SubmitWorkSchema>;

/**
 * Validate request body against a Zod schema.
 * Returns { data } on success or { error, details } on failure.
 */
export function validateBody<T>(
  schema: z.ZodType<T>,
  body: unknown
): { data: T; error?: never } | { data?: never; error: string; details: z.ZodIssue[] } {
  const result = schema.safeParse(body);
  if (result.success) {
    return { data: result.data };
  }
  const messages = result.error.issues.map(
    (i) => `${i.path.join(".")}: ${i.message}`
  );
  return {
    error: messages.join("; "),
    details: result.error.issues,
  };
}
