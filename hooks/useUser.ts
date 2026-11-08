"use client";

import { useEffect, useState, useCallback } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface UserProfile {
  id: string;
  display_name?: string | null;
  username?: string | null;
  bio?: string | null;
  is_public?: boolean;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch or sync user profile from profiles table
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, username, bio, is_public")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
      }
    } catch (e) {
      console.warn("Could not fetch user profile:", e);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Check active session on mount
    const initUser = async () => {
      try {
        const {
          data: { session: activeSession },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (activeSession?.user) {
          setSession(activeSession);
          setUser(activeSession.user);
          await fetchProfile(activeSession.user.id);
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.warn("Auth initialization notice:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initUser();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      if (!isMounted) return;

      if (currentSession?.user) {
        setSession(currentSession);
        setUser(currentSession.user);
        await fetchProfile(currentSession.user.id);
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const displayName =
    profile?.display_name ||
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Explorer";

  return {
    user,
    session,
    profile,
    displayName,
    loading,
    signOut,
    refreshProfile,
  };
}
