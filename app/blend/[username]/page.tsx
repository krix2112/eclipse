import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus, Sparkles, Compass, LogIn } from "lucide-react";
import { supabase, getServerUser } from "@/lib/supabase";
import { type MovieNode, getDecadeFromYear } from "@/lib/graph";
import BlendClient from "@/components/BlendClient";

interface PageProps {
  params: {
    username: string;
  };
}

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

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const username = params.username?.toLowerCase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .ilike("username", username)
    .maybeSingle();

  const friendName = profile?.display_name || profile?.username || username;

  return {
    title: `Blend with @${username} | Eclipse`,
    description: `Compare movie taste and discover taste compatibility with ${friendName} on Eclipse.`,
    openGraph: {
      title: `Movie Blend with @${username} on Eclipse`,
      description: `Explore shared movies and taste compatibility with ${friendName} on Eclipse.`,
    },
  };
}

/**
 * Movie Blend Page
 * Login required, accepted friends only.
 * Loads both users' watched movies (strictly public columns only) and renders the blend experience.
 */
export default async function BlendPage({ params }: PageProps) {
  const username = params.username?.toLowerCase();

  // 1. Fetch friend profile
  const { data: friendProfile, error: friendError } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, is_public")
    .ilike("username", username)
    .maybeSingle();

  if (friendError || !friendProfile) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-[#0F0F12] text-[#F2F2F3] px-4 py-16">
        <div className="max-w-md w-full bg-[#17171C] border border-[#26262D] rounded-2xl p-8 text-center flex flex-col items-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-[#26262D]/60 flex items-center justify-center mb-4 text-[#8B8B95]">
            <Compass className="w-7 h-7 text-[#FF5A4F]" />
          </div>
          <h1 className="text-xl font-bold text-[#F2F2F3] mb-2">
            User not found
          </h1>
          <p className="text-sm text-[#8B8B95] mb-6">
            We couldn&apos;t find a user matching @{username}. Please check the username and try again.
          </p>
          <Link
            href="/friends"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5A4F] hover:bg-[#E84E44] text-white text-sm font-semibold transition-all shadow-subtle"
          >
            Go to Friends
          </Link>
        </div>
      </div>
    );
  }

  // 2. Check logged-in viewer
  const viewer = await getServerUser();

  if (!viewer) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-[#0F0F12] text-[#F2F2F3] px-4 py-16">
        <div className="max-w-md w-full bg-[#17171C] border border-[#26262D] rounded-2xl p-8 text-center flex flex-col items-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-[#FF5A4F]/10 flex items-center justify-center mb-4 text-[#FF5A4F] border border-[#FF5A4F]/20">
            <LogIn className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-[#F2F2F3] mb-2">
            Sign in to Blend
          </h1>
          <p className="text-sm text-[#8B8B95] mb-6">
            Sign in to compare movie taste and blend movie maps with @{friendProfile.username}.
          </p>
          <Link
            href={`/login?redirect=/blend/${friendProfile.username}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5A4F] hover:bg-[#E84E44] text-white text-sm font-semibold transition-all shadow-subtle"
          >
            Sign in to Eclipse
          </Link>
        </div>
      </div>
    );
  }

  // Self check
  if (viewer.id === friendProfile.id) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-[#0F0F12] text-[#F2F2F3] px-4 py-16">
        <div className="max-w-md w-full bg-[#17171C] border border-[#26262D] rounded-2xl p-8 text-center flex flex-col items-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-[#38BDF8]/10 flex items-center justify-center mb-4 text-[#38BDF8] border border-[#38BDF8]/20">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-[#F2F2F3] mb-2">
            You&apos;re viewing your own profile
          </h1>
          <p className="text-sm text-[#8B8B95] mb-6">
            Movie Blend compares taste between two different people. Connect with friends to blend your movie maps!
          </p>
          <Link
            href="/friends"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5A4F] hover:bg-[#E84E44] text-white text-sm font-semibold transition-all shadow-subtle"
          >
            Find friends
          </Link>
        </div>
      </div>
    );
  }

  // 3. Check accepted friendship in Supabase
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id, status")
    .eq("status", "accepted")
    .or(
      `and(requester_id.eq.${viewer.id},addressee_id.eq.${friendProfile.id}),and(requester_id.eq.${friendProfile.id},addressee_id.eq.${viewer.id})`
    )
    .maybeSingle();

  // If NOT accepted friends, show "Add them as a friend to blend"
  if (!friendship) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-[#0F0F12] text-[#F2F2F3] px-4 py-16">
        <div className="max-w-md w-full bg-[#17171C] border border-[#26262D] rounded-2xl p-8 text-center flex flex-col items-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-[#FF5A4F]/10 text-[#FF5A4F] flex items-center justify-center mb-4 border border-[#FF5A4F]/20">
            <UserPlus className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-[#F2F2F3] mb-2">
            Add them as a friend to blend
          </h1>
          <p className="text-sm text-[#8B8B95] mb-6 leading-relaxed">
            Movie Blend calculates shared movies, genre affinity, and ratings overlap between accepted friends. Connect with{" "}
            <span className="text-[#F2F2F3] font-semibold">@{friendProfile.username}</span> to unlock your blended map.
          </p>
          <Link
            href="/friends"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FF5A4F] hover:bg-[#E84E44] text-white text-sm font-semibold transition-all shadow-subtle"
          >
            <UserPlus className="w-4 h-4" />
            Go to Friends to connect
          </Link>
        </div>
      </div>
    );
  }

  // 4. Fetch viewer profile for display
  const { data: viewerProf } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", viewer.id)
    .maybeSingle();

  const viewerDisplayName =
    viewerProf?.display_name || viewerProf?.username || "You";

  // 5. Fetch watched movies for both users
  // SECURITY CONSTRAINT: Select strictly tmdb_id, title, year, poster_path, genres, status, watched_on, my_rating, original_language.
  // NEVER select my_note or private columns.
  async function fetchUserMovies(userId: string): Promise<MovieNode[]> {
    let rows: PublicMovieRow[] = [];

    const { data, error } = await supabase
      .from("user_movies")
      .select(
        "tmdb_id, title, year, poster_path, genres, status, watched_on, my_rating, original_language"
      )
      .eq("user_id", userId)
      .eq("status", "watched")
      .order("added_at", { ascending: true });

    if (error) {
      const fallback = await supabase
        .from("user_movies")
        .select(
          "tmdb_id, title, year, poster_path, genres, status, my_rating"
        )
        .eq("user_id", userId)
        .eq("status", "watched")
        .order("added_at", { ascending: true });
      rows = (fallback.data as PublicMovieRow[]) || [];
    } else {
      rows = (data as PublicMovieRow[]) || [];
    }

    return rows.map((row) => ({
      id: String(row.tmdb_id),
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
  }

  const [viewerMovies, friendMovies] = await Promise.all([
    fetchUserMovies(viewer.id),
    fetchUserMovies(friendProfile.id),
  ]);

  return (
    <BlendClient
      viewerProfile={{
        id: viewer.id,
        username: viewerProf?.username || "you",
        displayName: viewerDisplayName,
      }}
      friendProfile={{
        id: friendProfile.id,
        username: friendProfile.username,
        displayName: friendProfile.display_name || friendProfile.username,
        bio: friendProfile.bio || null,
      }}
      viewerMovies={viewerMovies}
      friendMovies={friendMovies}
    />
  );
}
