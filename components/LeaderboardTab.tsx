"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Trophy,
  Crown,
  Calendar,
  Film,
  MapPin,
  Sparkles,
  Loader2,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { type MovieNode, getDecadeFromYear } from "@/lib/graph";
import { computeScore, type CinemaScoreResult } from "@/lib/score";
import type { FriendProfile } from "@/hooks/useFriends";
import type { UserProfile } from "@/hooks/useUser";

interface LeaderboardTabProps {
  friends: FriendProfile[];
  currentUserId: string;
  currentUserProfile: UserProfile | null;
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  displayName: string;
  isSelf: boolean;
  score: CinemaScoreResult;
  movieCount: number;
}

interface RawMovieRow {
  user_id: string;
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

export default function LeaderboardTab({
  friends,
  currentUserId,
  currentUserProfile,
}: LeaderboardTabProps) {
  const [timeframe, setTimeframe] = useState<"all" | "month">("all");
  const [loading, setLoading] = useState(true);
  const [userMoviesMap, setUserMoviesMap] = useState<Map<string, MovieNode[]>>(
    new Map()
  );

  const currentYearMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, []);

  const monthLabel = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, []);

  // Fetch watched movies for all target users
  // SECURITY REQUIREMENT:
  // Select strictly tmdb_id, title, year, poster_path, genres, status, watched_on, my_rating, original_language.
  // NEVER select my_note.
  const fetchAllMovies = useCallback(async () => {
    setLoading(true);
    const targetIds = [currentUserId, ...friends.map((f) => f.id)];

    try {
      let rows: RawMovieRow[] = [];

      const { data, error } = await supabase
        .from("user_movies")
        .select(
          "user_id, tmdb_id, title, year, poster_path, genres, status, watched_on, my_rating, original_language"
        )
        .in("user_id", targetIds)
        .eq("status", "watched");

      if (error && error.code === "42703") {
        const fallback = await supabase
          .from("user_movies")
          .select(
            "user_id, tmdb_id, title, year, poster_path, genres, status, my_rating"
          )
          .in("user_id", targetIds)
          .eq("status", "watched");
        rows = (fallback.data as RawMovieRow[]) || [];
      } else {
        rows = (data as RawMovieRow[]) || [];
      }

      const map = new Map<string, MovieNode[]>();
      targetIds.forEach((id) => map.set(id, []));

      rows.forEach((row) => {
        const uid = row.user_id;
        const list = map.get(uid) || [];
        list.push({
          id: String(row.tmdb_id),
          title: row.title,
          year: row.year || "",
          posterPath: row.poster_path ?? null,
          genres: Array.isArray(row.genres) ? row.genres : [],
          status: "watched",
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
        });
        map.set(uid, list);
      });

      setUserMoviesMap(map);
    } catch (err) {
      console.error("Leaderboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, friends]);

  useEffect(() => {
    fetchAllMovies();
  }, [fetchAllMovies]);

  // Compute leaderboard entries
  const entries: LeaderboardEntry[] = useMemo(() => {
    const list: LeaderboardEntry[] = [];

    // Current user entry
    const myMoviesRaw = userMoviesMap.get(currentUserId) || [];
    const myFiltered =
      timeframe === "month"
        ? myMoviesRaw.filter((m) => m.watchedOn && m.watchedOn.startsWith(currentYearMonth))
        : myMoviesRaw;

    const myScore = computeScore(myFiltered);
    list.push({
      userId: currentUserId,
      username: currentUserProfile?.username || "you",
      displayName: currentUserProfile?.display_name || currentUserProfile?.username || "You",
      isSelf: true,
      score: myScore,
      movieCount: myFiltered.length,
    });

    // Friends entries
    friends.forEach((f) => {
      const fMoviesRaw = userMoviesMap.get(f.id) || [];
      const fFiltered =
        timeframe === "month"
          ? fMoviesRaw.filter((m) => m.watchedOn && m.watchedOn.startsWith(currentYearMonth))
          : fMoviesRaw;

      const fScore = computeScore(fFiltered);
      list.push({
        userId: f.id,
        username: f.username,
        displayName: f.displayName,
        isSelf: false,
        score: fScore,
        movieCount: fFiltered.length,
      });
    });

    // Sort descending by score total, then by movie count
    return list.sort((a, b) => {
      if (b.score.total !== a.score.total) {
        return b.score.total - a.score.total;
      }
      return b.movieCount - a.movieCount;
    });
  }, [userMoviesMap, currentUserId, currentUserProfile, friends, timeframe, currentYearMonth]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[#8B8B95] gap-3">
        <Loader2 className="w-6 h-6 text-[#FF5A4F] animate-spin" />
        <span className="text-xs">Calculating Cinema Scores...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Timeframe & Subheader */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#17171C] p-4 rounded-2xl border border-[#26262D]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#FF5A4F]/10 border border-[#FF5A4F]/20 flex items-center justify-center text-[#FF5A4F]">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F2F2F3]">
              Cinema Score Leaderboard
            </h3>
            <p className="text-xs text-[#8B8B95]">
              Ranked by cinematic exploration, diversity, and film taste
            </p>
          </div>
        </div>

        {/* Toggle: All Time vs This Month */}
        <div className="flex items-center gap-1 bg-[#0F0F12] p-1 rounded-xl border border-[#26262D] self-start sm:self-center">
          <button
            type="button"
            onClick={() => setTimeframe("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              timeframe === "all"
                ? "bg-[#FF5A4F] text-white shadow-sm"
                : "text-[#8B8B95] hover:text-[#F2F2F3]"
            }`}
          >
            All time
          </button>
          <button
            type="button"
            onClick={() => setTimeframe("month")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              timeframe === "month"
                ? "bg-[#FF5A4F] text-white shadow-sm"
                : "text-[#8B8B95] hover:text-[#F2F2F3]"
            }`}
          >
            <Calendar className="w-3 h-3" />
            <span>This month ({monthLabel.split(" ")[0]})</span>
          </button>
        </div>
      </div>

      {/* Friends Count Notice if no friends */}
      {friends.length === 0 && (
        <div className="p-4 rounded-xl bg-[#17171C] border border-[#26262D] flex items-center justify-between gap-4 text-xs text-[#8B8B95]">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#FF5A4F] flex-shrink-0" />
            <span>
              You don&apos;t have any friends connected yet. Connect with fellow film lovers to climb the leaderboard together!
            </span>
          </div>
        </div>
      )}

      {/* Leaderboard Cards */}
      <div className="space-y-2.5">
        {entries.map((entry, index) => {
          const rank = index + 1;
          const isFirst = rank === 1;
          const isSecond = rank === 2;
          const isThird = rank === 3;

          return (
            <div
              key={entry.userId}
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
                entry.isSelf
                  ? "bg-[#1C1C24] border-[#FF5A4F]/40 shadow-sm"
                  : "bg-[#17171C] border-[#26262D] hover:border-[#383844]"
              }`}
            >
              {/* Left: Rank + Avatar + Name + Level */}
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Rank Badge */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                    isFirst
                      ? "bg-amber-400/15 text-amber-400 border border-amber-400/30"
                      : isSecond
                      ? "bg-slate-300/15 text-slate-300 border border-slate-300/30"
                      : isThird
                      ? "bg-amber-700/15 text-amber-600 border border-amber-700/30"
                      : "bg-[#0F0F12] text-[#8B8B95] border border-[#26262D]"
                  }`}
                >
                  {isFirst ? <Crown className="w-4 h-4" /> : `#${rank}`}
                </div>

                {/* Avatar Initial */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    entry.isSelf
                      ? "bg-[#FF5A4F] text-white"
                      : "bg-[#0F0F12] border border-[#26262D] text-[#8B8B95]"
                  }`}
                >
                  {entry.displayName.charAt(0).toUpperCase()}
                </div>

                {/* Name & Tag */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#F2F2F3] truncate">
                      {entry.displayName}
                    </span>
                    {entry.isSelf && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#FF5A4F]/20 text-[#FF5A4F]">
                        You
                      </span>
                    )}
                    <span className="text-xs text-[#8B8B95] font-mono">
                      @{entry.username}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                    {/* Level Label */}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#26262D] text-[#FF5A4F]">
                      {entry.score.level.name}
                    </span>
                    <span className="text-[#8B8B95]">•</span>
                    <span className="text-[11px] text-[#8B8B95] flex items-center gap-1">
                      <Film className="w-3 h-3" />
                      {entry.movieCount} {entry.movieCount === 1 ? "movie" : "movies"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Score Total & Quick Action */}
              <div className="flex items-center justify-between sm:justify-end gap-4 self-end sm:self-center">
                <div className="text-right">
                  <div className="font-mono font-extrabold text-base sm:text-lg text-[#F2F2F3]">
                    {entry.score.total}{" "}
                    <span className="text-xs font-normal text-[#8B8B95]">pts</span>
                  </div>
                </div>

                {entry.isSelf ? (
                  <Link
                    href="/graph"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#F2F2F3] bg-[#26262D] hover:bg-[#383842] transition-colors"
                  >
                    <MapPin className="w-3 h-3 text-[#FF5A4F]" />
                    <span>My map</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/u/${entry.username}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#F2F2F3] bg-[#26262D] hover:bg-[#383842] transition-colors"
                    >
                      <MapPin className="w-3 h-3 text-[#38BDF8]" />
                      <span>Map</span>
                    </Link>
                    <Link
                      href={`/blend/${entry.username}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors shadow-subtle"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Blend</span>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

