import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client instance reading credentials from environment variables.
 * Supports both anon key and publishable key naming conventions.
 */
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "placeholder-anon-key";

if (
  process.env.NODE_ENV === "development" &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY))
) {
  console.warn(
    "[Supabase] Warning: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined. Please configure .env.local."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Sync auth token to cookie in browser for Server Components / SSR
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_event, session) => {
    try {
      if (session?.access_token) {
        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${
          60 * 60 * 24 * 7
        }; SameSite=Lax`;
      } else {
        document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax`;
      }
    } catch {
      // Ignore in non-browser or sandbox environments
    }
  });
}

/**
 * Helper to retrieve and verify the authenticated user on the server (Server Components & Route Handlers).
 * Reads the `sb-access-token` cookie and verifies it against Supabase.
 */
export async function getServerUser() {
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = cookies();
    const token = cookieStore.get("sb-access-token")?.value;
    if (!token) return null;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}
