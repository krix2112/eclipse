"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Star,
  Play,
  Check,
  EyeOff,
  Trash2,
  Plus,
  Film,
  ChevronDown,
  ChevronUp,
  User,
  Sparkles,
  Trophy,
} from "lucide-react";
import type { MovieNode } from "@/lib/graph";
import type { MovieDetails, SimilarMovie, CastMember } from "@/lib/tmdb";

interface MovieDetailPanelProps {
  movieNode: MovieNode;
  allMapNodes: MovieNode[];
  onClose: () => void;
  onRemoveMovie?: (node: MovieNode) => void;
  onMarkAsWatched?: (node: MovieNode) => void;
  onDismissRecommendation?: (node: MovieNode) => void;
  onAddMovieById?: (tmdbId: number) => Promise<void>;
  onUpdateRatingAndNote?: (
    id: string | number,
    rating: number | null,
    note: string | null
  ) => void;
  onUpdateWatchedOn?: (id: string | number, watchedOn: string) => void;
  onSelectConnectedMovie?: (node: MovieNode) => void;
  onHighlightPerson?: (name: string | null) => void;
  activeHighlightedPerson?: string | null;
  readOnly?: boolean;
}

export default function MovieDetailPanel({
  movieNode,
  allMapNodes,
  onClose,
  onRemoveMovie,
  onMarkAsWatched,
  onDismissRecommendation,
  onAddMovieById,
  onUpdateRatingAndNote,
  onUpdateWatchedOn,
  onSelectConnectedMovie,
  onHighlightPerson,
  activeHighlightedPerson,
  readOnly = false,
}: MovieDetailPanelProps) {
  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overview expand/collapse
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

  // Trailer modal state
  const [showTrailerModal, setShowTrailerModal] = useState(false);

  // User Rating & Note state
  const [currentRating, setCurrentRating] = useState<number | null>(
    movieNode.myRating ?? null
  );
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [currentNote, setCurrentNote] = useState<string>(
    movieNode.myNote || ""
  );
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

  // Watched on date state
  const initialWatchedOn =
    movieNode.watchedOn ||
    (movieNode.addedAt
      ? new Date(movieNode.addedAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0]);
  const [currentWatchedOn, setCurrentWatchedOn] = useState<string>(initialWatchedOn);
  const [isYearOnly, setIsYearOnly] = useState<boolean>(
    /^\d{4}$/.test(movieNode.watchedOn || "")
  );
  const [watchedSavedFeedback, setWatchedSavedFeedback] = useState(false);

  // Sync state if movieNode changes
  useEffect(() => {
    setCurrentRating(movieNode.myRating ?? null);
    setCurrentNote(movieNode.myNote || "");
    const w =
      movieNode.watchedOn ||
      (movieNode.addedAt
        ? new Date(movieNode.addedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]);
    setCurrentWatchedOn(w);
    setIsYearOnly(/^\d{4}$/.test(movieNode.watchedOn || ""));
  }, [movieNode]);

  // Handlers for Watched on date
  const handleWatchedOnChange = (val: string) => {
    setCurrentWatchedOn(val);
    onUpdateWatchedOn?.(movieNode.id, val);
    setWatchedSavedFeedback(true);
    setTimeout(() => setWatchedSavedFeedback(false), 2000);
  };

  const handleToggleYearOnly = (yearOnly: boolean) => {
    setIsYearOnly(yearOnly);
    let nextVal = currentWatchedOn;
    if (yearOnly) {
      nextVal = currentWatchedOn.slice(0, 4) || (movieNode.year || "2024");
    } else {
      nextVal =
        currentWatchedOn.length === 4
          ? `${currentWatchedOn}-01-01`
          : currentWatchedOn || new Date().toISOString().split("T")[0];
    }
    setCurrentWatchedOn(nextVal);
    onUpdateWatchedOn?.(movieNode.id, nextVal);
    setWatchedSavedFeedback(true);
    setTimeout(() => setWatchedSavedFeedback(false), 2000);
  };

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showTrailerModal) {
          setShowTrailerModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, showTrailerModal]);

  // Fetch full extended details from /api/movies/[id]
  useEffect(() => {
    let isCurrent = true;
    setLoading(true);
    setError(null);

    fetch(`/api/movies/${movieNode.id}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load details (${res.status})`);
        }
        return res.json();
      })
      .then((data: MovieDetails) => {
        if (isCurrent) {
          setDetails(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isCurrent) {
          console.warn("Could not fetch extended movie details:", err);
          setError("Could not load full metadata. Showing basic info.");
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [movieNode.id]);

  // Handle rating change
  const handleRate = (value: number) => {
    const nextRating = currentRating === value ? null : value;
    setCurrentRating(nextRating);
    onUpdateRatingAndNote?.(movieNode.id, nextRating, currentNote || null);
  };

  // Handle saving personal note
  const handleSaveNote = () => {
    setIsSavingNote(true);
    onUpdateRatingAndNote?.(
      movieNode.id,
      currentRating,
      currentNote.trim() || null
    );
    setTimeout(() => {
      setIsSavingNote(false);
      setNoteSavedFeedback(true);
      setTimeout(() => setNoteSavedFeedback(false), 2000);
    }, 200);
  };

  // Find map connections for this movie
  const mapConnections = useMemo(() => {
    const movieIdStr = String(movieNode.id);
    const others = allMapNodes.filter((n) => String(n.id) !== movieIdStr);

    const matches: Array<{
      node: MovieNode;
      reasons: string[];
    }> = [];

    const movieGenres = new Set(movieNode.genres.map((g) => g.name));
    const movieDirector = movieNode.director?.trim();
    const movieCast = new Set(movieNode.cast || []);
    const movieDecade = movieNode.decade;

    for (const other of others) {
      const reasons: string[] = [];

      // Same director
      if (
        movieDirector &&
        movieDirector !== "Unknown Director" &&
        other.director === movieDirector
      ) {
        reasons.push(`Directed by ${movieDirector}`);
      }

      // Shared cast
      const sharedActors = (other.cast || []).filter((a) =>
        movieCast.has(a)
      );
      if (sharedActors.length > 0) {
        reasons.push(`Shared actor: ${sharedActors[0]}`);
      }

      // Same primary genre
      const commonGenres = other.genres.filter((g) => movieGenres.has(g.name));
      if (commonGenres.length > 0 && reasons.length === 0) {
        reasons.push(`Both ${commonGenres[0].name}`);
      }

      // Same decade
      if (movieDecade && other.decade === movieDecade && reasons.length === 0) {
        reasons.push(`Both from the ${movieDecade}`);
      }

      if (reasons.length > 0) {
        matches.push({ node: other, reasons });
      }
    }

    return matches.slice(0, 8);
  }, [movieNode, allMapNodes]);

  // Set of TMDB IDs already in map (for similar movies quick check)
  const mapIdSet = useMemo(() => {
    return new Set(allMapNodes.map((n) => String(n.id)));
  }, [allMapNodes]);

  // Certification / Age rating (hide if missing or N/A)
  const ageRating =
    details?.omdb?.rated && details.omdb.rated !== "N/A"
      ? details.omdb.rated
      : null;

  return (
    <>
      {/* Dark backdrop click-away overlay on desktop and mobile */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 transition-opacity"
      />

      {/* Slide-over panel (about 560px wide, full height, scrollable) */}
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[540px] md:w-[560px] lg:w-[580px] max-w-full bg-[#17171C] border-l border-[#26262D] shadow-2xl flex flex-col overflow-hidden text-[#F2F2F3]"
      >
        {/* Floating Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 rounded-full bg-[#0F0F12]/80 hover:bg-[#26262D] text-[#8B8B95] hover:text-[#F2F2F3] border border-[#26262D]/60 backdrop-blur shadow-md transition-all"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto pb-28">
          {/* SECTION 1: HERO BACKDROP & OVERLAPPING POSTER */}
          <div className="relative w-full">
            {/* Backdrop Image with gradient overlay */}
            <div className="relative w-full h-56 sm:h-64 bg-[#0F0F12] overflow-hidden">
              {details?.backdrop_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://image.tmdb.org/t/p/w780${details.backdrop_path}`}
                  alt={movieNode.title}
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#17171C] to-[#0F0F12] flex items-center justify-center text-[#8B8B95]">
                  <Film className="w-12 h-12 opacity-30" />
                </div>
              )}
              {/* Fade to background */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#17171C] via-[#17171C]/60 to-transparent" />
            </div>

            {/* Poster & Header Info Block */}
            <div className="relative px-6 -mt-20 flex gap-4 items-end">
              {/* Overlapping Poster */}
              <div className="w-28 sm:w-32 aspect-[2/3] rounded-xl overflow-hidden bg-[#0F0F12] border-2 border-[#26262D] shadow-2xl flex-shrink-0 z-10">
                {movieNode.posterPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://image.tmdb.org/t/p/w342${movieNode.posterPath}`}
                    alt={movieNode.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-[#8B8B95]">
                    <Film className="w-6 h-6 mb-1 text-[#FF5A4F]" />
                    <span className="text-[10px]">{movieNode.title}</span>
                  </div>
                )}
              </div>

              {/* Title, Year, Runtime, Age Rating */}
              <div className="flex-1 pb-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                      movieNode.status === "recommended"
                        ? "bg-[#FF5A4F]/10 text-[#FF5A4F] border-[#FF5A4F]/30"
                        : "bg-[#26262D] text-[#8B8B95] border-[#26262D]"
                    }`}
                  >
                    {movieNode.status === "recommended" ? "Recommended" : "Watched"}
                  </span>

                  {movieNode.status === "recommended" && movieNode.kind && (
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        movieNode.kind === "stretch"
                          ? "bg-[#FF5A4F] text-[#0F0F12]"
                          : "bg-[#26262D] text-[#F2F2F3] border border-[#383842]"
                      }`}
                    >
                      {movieNode.kind === "stretch" ? "Stretch" : "Similar"}
                    </span>
                  )}

                  {ageRating && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0F0F12] border border-[#26262D] text-[#8B8B95]">
                      {ageRating}
                    </span>
                  )}
                </div>

                <h1 className="text-xl sm:text-2xl font-bold text-[#F2F2F3] leading-tight">
                  {movieNode.title}
                </h1>

                <div className="flex items-center gap-2 text-xs text-[#8B8B95] font-mono mt-1">
                  {(movieNode.year || details?.release_year) && (
                    <span>{movieNode.year || details?.release_year}</span>
                  )}
                  {details?.runtimeFormatted && (
                    <>
                      <span>•</span>
                      <span>{details.runtimeFormatted}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tagline */}
            {details?.tagline && (
              <div className="px-6 mt-3">
                <p className="text-xs text-[#8B8B95] italic leading-relaxed">
                  &ldquo;{details.tagline}&rdquo;
                </p>
              </div>
            )}
          </div>

          <div className="px-6 mt-5 space-y-6">
            {/* Loading / Error Indicators for Extended Data */}
            {loading && !details && (
              <div className="flex items-center gap-2 text-xs text-[#8B8B95] px-1 animate-pulse">
                <div className="w-3.5 h-3.5 border-2 border-[#FF5A4F] border-t-transparent rounded-full animate-spin" />
                <span>Loading extended ratings and connections...</span>
              </div>
            )}
            {error && !details && (
              <div className="p-2.5 rounded-xl bg-[#FF5A4F]/10 border border-[#FF5A4F]/20 text-xs text-[#FF5A4F]">
                {error}
              </div>
            )}

            {/* SECTION 2: COMPACT RATINGS ROW */}
            <div className="p-3 rounded-2xl bg-[#0F0F12] border border-[#26262D] flex flex-wrap items-center gap-2 text-xs">
              {/* TMDB Rating */}
              {typeof movieNode.voteAverage === "number" &&
                movieNode.voteAverage > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#17171C] border border-[#26262D]">
                    <span className="text-[11px] font-bold text-amber-400">
                      TMDB
                    </span>
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-[#F2F2F3]">
                      {movieNode.voteAverage.toFixed(1)}
                    </span>
                  </div>
                )}

              {/* OMDb IMDb Rating with votes */}
              {details?.omdb?.imdbRating && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#17171C] border border-[#26262D]">
                  <span className="text-[11px] font-black text-amber-300">
                    IMDb
                  </span>
                  <span className="font-semibold text-[#F2F2F3]">
                    {details.omdb.imdbRating}
                  </span>
                  {details.omdb.imdbVotes && (
                    <span className="text-[10px] text-[#8B8B95] font-mono">
                      ({details.omdb.imdbVotes})
                    </span>
                  )}
                </div>
              )}

              {/* OMDb Rotten Tomatoes % */}
              {details?.omdb?.rottenTomatoes && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#17171C] border border-[#26262D]">
                  <span className="text-[11px] font-bold text-red-400">
                    RT
                  </span>
                  <span className="font-semibold text-[#F2F2F3]">
                    {details.omdb.rottenTomatoes}
                  </span>
                </div>
              )}

              {/* OMDb Metacritic */}
              {details?.omdb?.metacritic && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#17171C] border border-[#26262D]">
                  <span className="text-[11px] font-bold text-emerald-400">
                    Metacritic
                  </span>
                  <span className="font-semibold text-[#F2F2F3]">
                    {details.omdb.metacritic}
                  </span>
                </div>
              )}

              {/* Personal rating badge if rated */}
              {currentRating && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#FF5A4F]/10 border border-[#FF5A4F]/30 text-[#FF5A4F]">
                  <span className="text-[10px] font-bold uppercase">{readOnly ? "Rating" : "You"}</span>
                  <Star className="w-3 h-3 fill-[#FF5A4F]" />
                  <span className="font-bold">{currentRating.toFixed(1)}</span>
                </div>
              )}
            </div>

            {/* SECTION 3: GENRES & AWARDS */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {movieNode.genres.map((g) => (
                  <span
                    key={g.id || g.name}
                    className="text-xs px-2.5 py-1 rounded-lg bg-[#0F0F12] border border-[#26262D] text-[#8B8B95]"
                  >
                    {g.name}
                  </span>
                ))}
              </div>

              {/* Awards text from OMDb */}
              {details?.omdb?.awards && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs text-amber-300/90">
                  <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span className="leading-snug">{details.omdb.awards}</span>
                </div>
              )}
            </div>

            {/* AI RECOMMENDATION REASON (IF RECOMMENDED) */}
            {movieNode.status === "recommended" && movieNode.reason && (
              <div className="p-3.5 rounded-xl bg-[#0F0F12] border border-[#FF5A4F]/30 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF5A4F]" />
                    <span className="font-semibold text-[#FF5A4F]">
                      AI Taste Link
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-[#17171C] text-[#8B8B95] border border-[#26262D]">
                    {movieNode.kind === "stretch" ? "Stretch Pick" : "Similar Pick"}
                  </span>
                </div>
                <p className="text-[#F2F2F3] leading-relaxed">
                  &ldquo;{movieNode.reason}&rdquo;
                </p>
              </div>
            )}

            {/* SECTION 4: OVERVIEW (COLLAPSIBLE IF LONG) */}
            {movieNode.overview && (
              <div>
                <h3 className="text-xs font-semibold text-[#8B8B95] uppercase tracking-wider mb-1.5">
                  Overview
                </h3>
                <p className="text-xs text-[#8B8B95] leading-relaxed">
                  {movieNode.overview.length > 240 && !isOverviewExpanded
                    ? `${movieNode.overview.slice(0, 240)}...`
                    : movieNode.overview}
                </p>
                {movieNode.overview.length > 240 && (
                  <button
                    type="button"
                    onClick={() => setIsOverviewExpanded(!isOverviewExpanded)}
                    className="inline-flex items-center gap-1 text-xs text-[#FF5A4F] hover:underline mt-1 font-medium"
                  >
                    <span>{isOverviewExpanded ? "Show less" : "Read more"}</span>
                    {isOverviewExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            )}

            {/* SECTION 5: YOUR LOG, 5-STAR RATING & PRIVATE NOTE */}
            {readOnly ? (
              (movieNode.watchedOn || (typeof movieNode.myRating === "number" && movieNode.myRating > 0)) && (
                <div className="p-4 rounded-2xl bg-[#0F0F12] border border-[#26262D] space-y-3">
                  {movieNode.watchedOn && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#8B8B95]">
                        Watched On
                      </span>
                      <span className="font-mono text-[#F2F2F3] font-medium">
                        {movieNode.watchedOn}
                      </span>
                    </div>
                  )}
                  {typeof movieNode.myRating === "number" && movieNode.myRating > 0 && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#26262D]/60">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#8B8B95]">
                        User Rating
                      </span>
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>{movieNode.myRating.toFixed(1)} / 5</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="p-4 rounded-2xl bg-[#0F0F12] border border-[#26262D] space-y-4">
                {/* Editable Watched On Date with Year Only option */}
                <div className="space-y-2 pb-3 border-b border-[#26262D]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#8B8B95]">
                        Watched On
                      </span>
                      {watchedSavedFeedback && (
                        <span className="text-[10px] text-emerald-400 font-medium">
                          Saved
                        </span>
                      )}
                    </div>

                    {/* Toggle: Full Date vs Year Only */}
                    <div className="flex items-center p-0.5 rounded-lg bg-[#17171C] border border-[#26262D] text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleToggleYearOnly(false)}
                        className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                          !isYearOnly
                            ? "bg-[#26262D] text-[#F2F2F3] shadow-sm"
                            : "text-[#8B8B95] hover:text-[#F2F2F3]"
                        }`}
                      >
                        Full Date
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleYearOnly(true)}
                        className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                          isYearOnly
                            ? "bg-[#26262D] text-[#F2F2F3] shadow-sm"
                            : "text-[#8B8B95] hover:text-[#F2F2F3]"
                        }`}
                      >
                        Year Only
                      </button>
                    </div>
                  </div>

                  {isYearOnly ? (
                    <input
                      type="number"
                      min="1900"
                      max="2099"
                      value={currentWatchedOn.slice(0, 4)}
                      onChange={(e) => handleWatchedOnChange(e.target.value)}
                      placeholder="YYYY (e.g. 2024)"
                      className="w-full px-3 py-1.5 rounded-xl bg-[#17171C] border border-[#26262D] text-xs text-[#F2F2F3] focus:outline-none focus:border-[#FF5A4F]/60 font-mono"
                    />
                  ) : (
                    <input
                      type="date"
                      value={
                        /^\d{4}-\d{2}-\d{2}$/.test(currentWatchedOn)
                          ? currentWatchedOn
                          : /^\d{4}$/.test(currentWatchedOn)
                          ? `${currentWatchedOn}-01-01`
                          : ""
                      }
                      onChange={(e) => handleWatchedOnChange(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-[#17171C] border border-[#26262D] text-xs text-[#F2F2F3] focus:outline-none focus:border-[#FF5A4F]/60 font-mono"
                    />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#8B8B95]">
                    Your Rating & Note
                  </span>
                  {currentRating !== null && (
                    <button
                      type="button"
                      onClick={() => handleRate(0)}
                      className="text-[11px] text-[#8B8B95] hover:text-[#FF5A4F] transition-colors"
                    >
                      Clear rating
                    </button>
                  )}
                </div>

                {/* 5-Star Interactive Input with Half-Star Precision */}
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((starIndex) => {
                    const activeVal = hoverRating ?? currentRating ?? 0;
                    const isFull = activeVal >= starIndex;
                    const isHalf = activeVal >= starIndex - 0.5 && !isFull;

                    return (
                      <div
                        key={starIndex}
                        className="relative w-8 h-8 flex items-center justify-center cursor-pointer group"
                        onMouseLeave={() => setHoverRating(null)}
                      >
                        {/* Left half touch area */}
                        <button
                          type="button"
                          onClick={() => handleRate(starIndex - 0.5)}
                          onMouseEnter={() => setHoverRating(starIndex - 0.5)}
                          className="absolute left-0 top-0 w-1/2 h-full z-10"
                          aria-label={`Rate ${starIndex - 0.5} stars`}
                        />
                        {/* Right half touch area */}
                        <button
                          type="button"
                          onClick={() => handleRate(starIndex)}
                          onMouseEnter={() => setHoverRating(starIndex)}
                          className="absolute right-0 top-0 w-1/2 h-full z-10"
                          aria-label={`Rate ${starIndex} stars`}
                        />

                        {/* Star SVG */}
                        <Star
                          className={`w-6 h-6 transition-all ${
                            isFull
                              ? "fill-amber-400 text-amber-400 scale-105"
                              : isHalf
                              ? "fill-amber-400/50 text-amber-400"
                              : "fill-transparent text-[#383842] group-hover:text-[#8B8B95]"
                          }`}
                        />
                      </div>
                    );
                  })}

                  <span className="text-xs font-mono font-medium ml-2 text-[#F2F2F3]">
                    {hoverRating !== null
                      ? `${hoverRating.toFixed(1)} / 5`
                      : currentRating !== null
                      ? `${currentRating.toFixed(1)} / 5`
                      : "Tap to rate"}
                  </span>
                </div>

                {/* Private Note Textarea */}
                <div className="space-y-1.5 pt-1">
                  <textarea
                    value={currentNote}
                    maxLength={280}
                    onChange={(e) => setCurrentNote(e.target.value)}
                    placeholder="Add a private note about this movie (max 280 chars)..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl bg-[#17171C] border border-[#26262D] text-xs text-[#F2F2F3] placeholder-[#8B8B95]/60 focus:outline-none focus:border-[#FF5A4F]/60 transition-colors resize-none"
                  />

                  <div className="flex items-center justify-between text-[11px] text-[#8B8B95]">
                    <span>{currentNote.length} / 280</span>
                    <div className="flex items-center gap-2">
                      {noteSavedFeedback && (
                        <span className="text-emerald-400 font-medium">
                          Saved
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveNote}
                        disabled={isSavingNote}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#26262D] hover:bg-[#383842] text-[#F2F2F3] transition-colors"
                      >
                        Save note
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 6: DIRECTOR & TOP 8 CAST AVATARS */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#8B8B95] uppercase tracking-wider">
                  People & Credits
                </h3>
                {activeHighlightedPerson && (
                  <button
                    type="button"
                    onClick={() => onHighlightPerson?.(null)}
                    className="text-[11px] text-[#FF5A4F] hover:underline"
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {/* Director Card */}
              {movieNode.director && (
                <div
                  onClick={() =>
                    onHighlightPerson?.(
                      activeHighlightedPerson === movieNode.director
                        ? null
                        : movieNode.director || null
                    )
                  }
                  className={`p-2.5 rounded-xl border mb-3 flex items-center justify-between cursor-pointer transition-all ${
                    activeHighlightedPerson === movieNode.director
                      ? "bg-[#FF5A4F]/10 border-[#FF5A4F] text-[#F2F2F3]"
                      : "bg-[#0F0F12] border-[#26262D] hover:border-[#FF5A4F]/40"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#17171C] border border-[#26262D] flex items-center justify-center text-[#8B8B95]">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#8B8B95] block uppercase font-medium">
                        Director
                      </span>
                      <span className="text-xs font-semibold text-[#F2F2F3]">
                        {movieNode.director}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#8B8B95] font-mono">
                    Filter map &rarr;
                  </span>
                </div>
              )}

              {/* Cast Avatars Grid */}
              {details?.topCast && details.topCast.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {details.topCast.map((actor: CastMember) => {
                    const isHighlighted =
                      activeHighlightedPerson === actor.name;

                    return (
                      <div
                        key={actor.id}
                        onClick={() =>
                          onHighlightPerson?.(
                            isHighlighted ? null : actor.name
                          )
                        }
                        className={`p-2 rounded-xl border flex flex-col items-center text-center cursor-pointer transition-all ${
                          isHighlighted
                            ? "bg-[#FF5A4F]/10 border-[#FF5A4F] scale-105"
                            : "bg-[#0F0F12] border-[#26262D] hover:border-[#FF5A4F]/40 hover:bg-[#17171C]"
                        }`}
                        title={`Highlight movies with ${actor.name}`}
                      >
                        {/* Avatar */}
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-[#17171C] border border-[#26262D] mb-1.5 flex-shrink-0">
                          {actor.profile_path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                              alt={actor.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#8B8B95]">
                              <User className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        <span className="text-[11px] font-semibold text-[#F2F2F3] line-clamp-1 w-full">
                          {actor.name}
                        </span>
                        {actor.character && (
                          <span className="text-[10px] text-[#8B8B95] line-clamp-1 w-full">
                            {actor.character}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION 7: TRAILER BUTTON */}
            <div>
              <h3 className="text-xs font-semibold text-[#8B8B95] uppercase tracking-wider mb-2">
                Trailer & Preview
              </h3>
              {details?.trailerYoutubeKey ? (
                <button
                  type="button"
                  onClick={() => setShowTrailerModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0F0F12] hover:bg-[#26262D] border border-[#26262D] text-xs font-semibold text-[#F2F2F3] hover:text-[#FF5A4F] transition-all shadow-sm group"
                >
                  <Play className="w-4 h-4 fill-[#FF5A4F] text-[#FF5A4F] group-hover:scale-110 transition-transform" />
                  <span>Watch official trailer</span>
                </button>
              ) : (
                <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs text-[#8B8B95] text-center">
                  No trailer video available
                </div>
              )}
            </div>

            {/* SECTION 8: WHERE TO WATCH (REGION IN / US) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-[#8B8B95] uppercase tracking-wider">
                  Where to Watch
                </h3>
                {details?.watchRegion && (
                  <span className="text-[10px] text-[#8B8B95] font-mono">
                    Region: {details.watchRegion}
                  </span>
                )}
              </div>

              {details?.watchProviders ? (
                <div className="p-3.5 rounded-2xl bg-[#0F0F12] border border-[#26262D] space-y-3 text-xs">
                  {/* Stream */}
                  {details.watchProviders.flatrate &&
                    details.watchProviders.flatrate.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#8B8B95] block mb-1.5">
                          Stream
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {details.watchProviders.flatrate.map((prov) => (
                            <div
                              key={prov.provider_id}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#17171C] border border-[#26262D]"
                              title={prov.provider_name}
                            >
                              {prov.logo_path && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={`https://image.tmdb.org/t/p/w92${prov.logo_path}`}
                                  alt={prov.provider_name}
                                  className="w-4 h-4 rounded-md object-cover"
                                />
                              )}
                              <span className="text-xs text-[#F2F2F3] font-medium">
                                {prov.provider_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Rent */}
                  {details.watchProviders.rent &&
                    details.watchProviders.rent.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#8B8B95] block mb-1.5">
                          Rent
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {details.watchProviders.rent.map((prov) => (
                            <div
                              key={prov.provider_id}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#17171C] border border-[#26262D]"
                              title={prov.provider_name}
                            >
                              {prov.logo_path && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={`https://image.tmdb.org/t/p/w92${prov.logo_path}`}
                                  alt={prov.provider_name}
                                  className="w-4 h-4 rounded-md object-cover"
                                />
                              )}
                              <span className="text-xs text-[#F2F2F3] font-medium">
                                {prov.provider_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Buy */}
                  {details.watchProviders.buy &&
                    details.watchProviders.buy.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#8B8B95] block mb-1.5">
                          Buy
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {details.watchProviders.buy.map((prov) => (
                            <div
                              key={prov.provider_id}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#17171C] border border-[#26262D]"
                              title={prov.provider_name}
                            >
                              {prov.logo_path && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={`https://image.tmdb.org/t/p/w92${prov.logo_path}`}
                                  alt={prov.provider_name}
                                  className="w-4 h-4 rounded-md object-cover"
                                />
                              )}
                              <span className="text-xs text-[#F2F2F3] font-medium">
                                {prov.provider_name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  <p className="text-[10px] text-[#8B8B95] pt-1">
                    Streaming data provided by JustWatch via TMDB.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs text-[#8B8B95] text-center">
                  No streaming providers found for your region.
                </div>
              )}
            </div>

            {/* SECTION 9: IN YOUR MAP (CONNECTIONS) */}
            <div>
              <h3 className="text-xs font-semibold text-[#8B8B95] uppercase tracking-wider mb-2">
                In Your Map ({mapConnections.length})
              </h3>
              {mapConnections.length > 0 ? (
                <div className="space-y-1.5">
                  {mapConnections.map(({ node: other, reasons }, idx) => (
                    <div
                      key={idx}
                      onClick={() => onSelectConnectedMovie?.(other)}
                      className="p-2.5 rounded-xl bg-[#0F0F12] border border-[#26262D] hover:border-[#FF5A4F]/40 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 aspect-[2/3] rounded bg-[#17171C] overflow-hidden flex-shrink-0">
                          {other.posterPath && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://image.tmdb.org/t/p/w92${other.posterPath}`}
                              alt={other.title}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="truncate">
                          <span className="text-xs font-semibold text-[#F2F2F3] block truncate">
                            {other.title}
                          </span>
                          <span className="text-[11px] text-[#8B8B95] block truncate">
                            {reasons.join(" • ")}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-[#FF5A4F] font-mono flex-shrink-0">
                        View &rarr;
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs text-[#8B8B95] text-center">
                  No other movies in your map share direct links yet.
                </div>
              )}
            </div>

            {/* SECTION 10: MORE LIKE THIS (6 SIMILAR MOVIES) */}
            {details?.similar && details.similar.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-[#8B8B95] uppercase tracking-wider mb-2">
                  More Like This
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {details.similar.map((sim: SimilarMovie) => {
                    const alreadyInMap = mapIdSet.has(String(sim.id));

                    return (
                      <div
                        key={sim.id}
                        className="p-2 rounded-xl bg-[#0F0F12] border border-[#26262D] flex flex-col justify-between"
                      >
                        <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-[#17171C] mb-2">
                          {sim.poster_path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`https://image.tmdb.org/t/p/w185${sim.poster_path}`}
                              alt={sim.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#8B8B95]">
                              <Film className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        <div className="mb-2">
                          <span className="text-xs font-bold text-[#F2F2F3] line-clamp-1 block">
                            {sim.title}
                          </span>
                          {sim.release_year && (
                            <span className="text-[10px] text-[#8B8B95] font-mono">
                              {sim.release_year}
                            </span>
                          )}
                        </div>

                        {!readOnly && (
                          alreadyInMap ? (
                            <div className="w-full py-1 rounded-lg bg-[#26262D] text-center text-[10px] font-semibold text-[#8B8B95]">
                              In map
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onAddMovieById?.(sim.id)}
                              className="w-full py-1.5 px-2 rounded-lg bg-[#FF5A4F]/10 hover:bg-[#FF5A4F] text-[#FF5A4F] hover:text-white border border-[#FF5A4F]/30 text-[11px] font-semibold flex items-center justify-center gap-1 transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add to map</span>
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* STICKY FOOTER ACTIONS */}
        {!readOnly && (
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[#26262D] bg-[#17171C]/95 backdrop-blur z-30">
            {movieNode.status === "recommended" ? (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onMarkAsWatched?.(movieNode)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors shadow-subtle"
                >
                  <Check className="w-4 h-4" />
                  <span>I&apos;ve watched this</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDismissRecommendation?.(movieNode)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-[#8B8B95] hover:text-[#F2F2F3] bg-[#0F0F12] hover:bg-[#26262D] border border-[#26262D] transition-colors"
                >
                  <EyeOff className="w-4 h-4" />
                  <span>Dismiss</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onRemoveMovie?.(movieNode)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove from map</span>
              </button>
            )}
          </div>
        )}
      </motion.aside>

      {/* INLINE YOUTUBE TRAILER MODAL */}
      <AnimatePresence>
        {showTrailerModal && details?.trailerYoutubeKey && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-3xl aspect-video rounded-2xl overflow-hidden bg-black border border-[#26262D] shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setShowTrailerModal(false)}
                className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/70 hover:bg-[#26262D] text-[#F2F2F3] transition-colors"
                aria-label="Close trailer"
              >
                <X className="w-5 h-5" />
              </button>
              <iframe
                src={`https://www.youtube.com/embed/${details.trailerYoutubeKey}?autoplay=1`}
                title={`${movieNode.title} Official Trailer`}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
