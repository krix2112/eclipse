import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Compass } from "lucide-react";
import { supabase, getServerUser } from "@/lib/supabase";
import { type MovieNode, getDecadeFromYear } from "@/lib/graph";
import PublicProfileClient from "@/components/PublicProfileClient";

interface PublicMovieRow {
  tmdb_id: number;
  title: string;
  year?: string;
  poster_path?: string | null;
  genres?: { id: number; name: string }[] | null;
  status: string;
  watched_on?: string | null;
  my_rating?: number | null;
  original_language?: string | null;
}

interface PageProps {
  params: {
    username: string;
  };
}

/**
 * Generate dynamic OpenGraph & page metadata for the public profile.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const username = params.username?.toLowerCase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, is_public")
    .ilike("username", username)
    .maybeSingle();

  if (!profile) {
    return {
      title: "Profile Not Found | Eclipse",
      description: "This movie map profile does not exist.",
    };
  }

  // If private, check if viewer is allowed
  let isAllowed = profile.is_public ?? false;
  if (!isAllowed) {
    const viewer = await getServerUser();
    if (viewer) {
      if (viewer.id === profile.id) {
        isAllowed = true;
      } else {
        const { data: friendship } = await supabase
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .or(
            `and(requester_id.eq.${viewer.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${viewer.id})`
          )
          .maybeSingle();
        if (friendship) isAllowed = true;
      }
    }
  }

  if (!isAllowed) {
    return {
      title: "Private Profile | Eclipse",
      description: "This movie map profile is private.",
    };
  }

  const displayName = profile.display_name || profile.username;

  // Query watched movie count
  const { count } = await supabase
    .from("user_movies")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("status", "watched");

  const movieCount = count || 0;

  return {
    title: `${displayName} on Eclipse`,
    description: `Explore ${displayName}'s movie map with ${movieCount} watched ${
      movieCount === 1 ? "movie" : "movies"
    } on Eclipse.`,
    openGraph: {
      title: `${displayName} on Eclipse`,
      description: `Explore ${displayName}'s movie map with ${movieCount} watched movies on Eclipse.`,
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} on Eclipse`,
      description: `Explore ${displayName}'s movie map with ${movieCount} watched movies on Eclipse.`,
    },
  };
}

/**
 * Public User Profile Page
 * Server-rendered with strict security: Never select my_note or private fields.
 * Permits friends to view maps even if their profile is set to private.
 */
export default async function PublicProfilePage({ params }: PageProps) {
  const username = params.username?.toLowerCase();

  // 1. Fetch user profile by username
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, is_public")
    .ilike("username", username)
    .maybeSingle();

  if (profileError || !profile) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-[#0F0F12] text-[#F2F2F3] px-4 py-16">
        <div className="max-w-md w-full bg-[#17171C] border border-[#26262D] rounded-2xl p-8 text-center flex flex-col items-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-[#26262D]/60 flex items-center justify-center mb-4 text-[#8B8B95]">
            <Lock className="w-7 h-7 text-[#FF5A4F]" />
          </div>
          <h1 className="text-xl font-bold text-[#F2F2F3] mb-2">
            This profile doesn&apos;t exist
          </h1>
          <p className="text-sm text-[#8B8B95] mb-6">
            The movie map you are looking for may have been removed, or the username is incorrect.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5A4F] hover:bg-[#E84E44] text-white text-sm font-semibold transition-all shadow-subtle"
          >
            <Compass className="w-4 h-4" />
            Explore Eclipse
          </Link>
        </div>
      </div>
    );
  }

  // If profile is private, check if viewer is allowed (is owner OR accepted friend)
  let isAllowed = profile.is_public ?? false;

  if (!isAllowed) {
    const viewer = await getServerUser();
    if (viewer) {
      if (viewer.id === profile.id) {
        isAllowed = true;
      } else {
        const { data: friendship } = await supabase
          .from("friendships")
          .select("id, status")
          .eq("status", "accepted")
          .or(
            `and(requester_id.eq.${viewer.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${viewer.id})`
          )
          .maybeSingle();

        if (friendship) {
          isAllowed = true;
        }
      }
    }
  }

  // If not allowed, render clean private message
  if (!isAllowed) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-[#0F0F12] text-[#F2F2F3] px-4 py-16">
        <div className="max-w-md w-full bg-[#17171C] border border-[#26262D] rounded-2xl p-8 text-center flex flex-col items-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-[#26262D]/60 flex items-center justify-center mb-4 text-[#8B8B95]">
            <Lock className="w-7 h-7 text-[#FF5A4F]" />
          </div>
          <h1 className="text-xl font-bold text-[#F2F2F3] mb-2">
            This profile is private
          </h1>
          <p className="text-sm text-[#8B8B95] mb-6">
            @{profile.username}&apos;s movie map is private. Connect with them as a friend on Eclipse to view their map and blend your movie tastes.
          </p>
          <Link
            href="/friends"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5A4F] hover:bg-[#E84E44] text-white text-sm font-semibold transition-all shadow-subtle"
          >
            <Compass className="w-4 h-4" />
            Go to Friends
          </Link>
        </div>
      </div>
    );
  }

  // 2. Fetch watched movies for this user.
  // SECURITY REQUIREMENT:
  // Select strictly tmdb_id, title, year, poster_path, genres, status, watched_on, my_rating, original_language.
  // NEVER select my_note or any private columns.
  let rows: PublicMovieRow[] = [];

  const { data, error } = await supabase
    .from("user_movies")
    .select(
      "tmdb_id, title, year, poster_path, genres, status, watched_on, my_rating, original_language"
    )
    .eq("user_id", profile.id)
    .eq("status", "watched")
    .order("added_at", { ascending: true });

  // Resilient fallback if watched_on or original_language column is not yet migrated in Supabase (42703 or PGRST204)
  if (error) {
    const fallback = await supabase
      .from("user_movies")
      .select(
        "tmdb_id, title, year, poster_path, genres, status, my_rating"
      )
      .eq("user_id", profile.id)
      .eq("status", "watched")
      .order("added_at", { ascending: true });
    rows = (fallback.data as PublicMovieRow[]) || [];
  } else {
    rows = (data as PublicMovieRow[]) || [];
  }

  // Map to MovieNode with no private notes
  const movies: MovieNode[] = rows.map((row) => ({
    id: row.tmdb_id,
    title: row.title,
    year: row.year || "",
    posterPath: row.poster_path ?? null,
    genres: Array.isArray(row.genres) ? row.genres : [],
    status: "watched" as const,
    addedAt: 0,
    watchedOn: row.watched_on
      ? String(row.watched_on)
      : row.year
      ? String(row.year)
      : new Date().toISOString().split("T")[0],
    overview: "",
    decade: getDecadeFromYear(row.year),
    myRating:
      row.my_rating !== undefined && row.my_rating !== null
        ? Number(row.my_rating)
        : null,
    myNote: null,
    originalLanguage: row.original_language || undefined,
  }));

  return (
    <PublicProfileClient
      profile={{
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name || profile.username,
        bio: profile.bio || null,
      }}
      movies={movies}
    />
  );
}
