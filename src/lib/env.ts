// Central place for reading environment variables.
// Secrets only ever come from the environment, never from code.

const NAMES = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "GNEWS_API_KEY",
  "CRON_SECRET",
  "ADMIN_PASSCODE",
] as const;

export type EnvName = (typeof NAMES)[number];

/** Returns the variable, or throws a clear error naming what is missing. */
export function requireEnv(name: EnvName): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing environment variable ${name}. Add it to .env.local (or Vercel settings).`);
  }
  return value.trim();
}

/** Returns the variable or undefined (for optional features like the GNews fallback). */
export function optionalEnv(name: EnvName): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const ALL_ENV_NAMES = NAMES;

/** Supabase URL reduced to its base (people often paste ".../rest/v1/"). */
export function supabaseBaseUrl(): string {
  const u = new URL(requireEnv("SUPABASE_URL"));
  return u.origin;
}
