import type { z } from "zod";
import {
  InventoryInputSchema,
  type InventoryInput,
} from "@/lib/validation/category/schema";

export type ValidatedInventoryInput = InventoryInput;

export function validateInventoryInput(
  raw: unknown
):
  | { ok: true; value: ValidatedInventoryInput }
  | { ok: false; issues: z.ZodIssue[] } {
  const result = InventoryInputSchema.safeParse(raw);

  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues,
    };
  }

  return {
    ok: true,
    value: result.data,
  };
}
