import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
}

export function hasSupabaseEnv() {
  return publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  }).success;
}

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

const operationsEnvSchema = z.object({
  CRON_SECRET: z.string().min(32).optional(),
  OBSERVABILITY_WEBHOOK_URL: z.url().optional(),
  ANALYTICS_RETENTION_DAYS: z.coerce.number().int().min(30).max(730).default(90),
});

export function getOperationsEnv() {
  return operationsEnvSchema.parse({
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    OBSERVABILITY_WEBHOOK_URL: process.env.OBSERVABILITY_WEBHOOK_URL || undefined,
    ANALYTICS_RETENTION_DAYS: process.env.ANALYTICS_RETENTION_DAYS,
  });
}
