import { afterEach, describe, expect, it } from "vitest";
import { getPublicEnv, getServerEnv, hasSupabaseEnv } from "./env";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
});

describe("configuration Supabase", () => {
  it("refuse une configuration absente", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(hasSupabaseEnv()).toBe(false);
    expect(() => getPublicEnv()).toThrow();
  });

  it("accepte une URL et une clé publiques valides", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(hasSupabaseEnv()).toBe(true);
  });

  it("exige séparément la clé service-role côté serveur", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => getServerEnv()).toThrow();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-at-least-twenty-characters";
    expect(getServerEnv().SUPABASE_SERVICE_ROLE_KEY).toContain("service-role");
  });
});
