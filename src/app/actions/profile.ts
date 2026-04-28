"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkSuspension } from "./suspension";
import { logger } from "@/lib/logger";
import {
  noHtmlTags,
  sanitizeUnicode,
  supabaseImageUrlSchema,
} from "@/lib/schemas";
import {
  checkRateLimit,
  getClientIPFromHeaders,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { headers } from "next/headers";

const CONTROL_CHARS_PATTERN = /[\u0000-\u001F\u007F-\u009F]/;

const profileLanguagesSchema = z
  .array(
    z
      .string()
      .transform(sanitizeUnicode)
      .pipe(
        z
          .string()
          .min(1, "Language cannot be empty")
          .max(40, "Each language must be 40 characters or less")
          .refine(noHtmlTags, "Languages cannot contain HTML")
          .refine(
            (value) => !CONTROL_CHARS_PATTERN.test(value),
            "Languages cannot contain control characters"
          )
      )
  )
  .max(20, "Maximum 20 languages allowed")
  .transform((languages) => {
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const language of languages) {
      const key = language.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(language);
    }

    return deduped;
  });

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  bio: z
    .string()
    .max(500, "Bio must be less than 500 characters")
    .optional()
    .nullable(),
  countryOfOrigin: z.string().max(100).optional().nullable(),
  languages: profileLanguagesSchema.optional(),
  image: supabaseImageUrlSchema.optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export async function updateProfile(data: UpdateProfileInput) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  const suspension = await checkSuspension();
  if (suspension.suspended) {
    return { error: suspension.error || "Account suspended" };
  }

  const headersList = await headers();
  const ip = getClientIPFromHeaders(headersList);
  const rateLimit = await checkRateLimit(
    `${ip}:${session.user.id}`,
    "profileUpdate",
    RATE_LIMITS.profileUpdate
  );
  if (!rateLimit.success) {
    return { error: "Too many requests. Please try again later." };
  }

  try {
    const validated = updateProfileSchema.parse(data);

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: validated.name,
        bio: validated.bio || null,
        countryOfOrigin: validated.countryOfOrigin || null,
        languages: validated.languages || [],
        image: validated.image || null,
      },
    });

    revalidatePath("/profile");
    revalidatePath(`/users/${session.user.id}`);

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    logger.sync.error("Failed to update profile", {
      action: "updateProfile",
      userId: session.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to update profile" };
  }
}

export async function getProfile() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", user: null };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
        countryOfOrigin: true,
        languages: true,
        isVerified: true,
        emailVerified: true,
      },
    });

    return { user, error: null };
  } catch (error) {
    logger.sync.error("Failed to fetch profile", {
      action: "getProfile",
      userId: session.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { error: "Failed to fetch profile", user: null };
  }
}
