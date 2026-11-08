"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Sparkles,
  Share2,
  Copy,
  Download,
  Check,
  X,
  Plus,
  Star,
  Film,
  Loader2,
  AlertCircle,
  Trophy,
  Award,
  Crown,
  Layers,
  GitMerge,
  Clock,
  Globe,
  Hourglass,
  Flame,
  Video,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import MetroMap from "@/components/MetroMap";
import MovieDetailPanel from "@/components/MovieDetailPanel";
import {
  type MovieNode,
  type ConnectionMode,
  rebuildFullGraph,
} from "@/lib/graph";
import {
  calculateMatchScore,
  sortMoviesByGenreAffinity,
  type BlendMovie,
} from "@/lib/blend";
import { saveMovie } from "@/lib/cloudGraph";
import type { ResolvedRecommendation } from "@/app/api/recommend/route";
import { computeScore, type BadgeInfo } from "@/lib/score";

const BADGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Film,
  Award,
  Sparkles,
  Crown,
  Layers,
  GitMerge,
  Clock,
  Globe,
  Hourglass,
  Star,
  Flame,
  Video,
};

interface BlendClientProps {
  viewerProfile: {
    id: string;
    username: string;
    displayName: string;
  };
  friendProfile: {
    id: string;
    username: string;
    displayName: string;
    bio?: string | null;
  };
  viewerMovies: MovieNode[];
  friendMovies: MovieNode[];
}

export default function BlendClient({
  viewerProfile,
  friendProfile,
  viewerMovies,
  friendMovies,
}: BlendClientProps) {
  const [filterMode, setFilterMode] = useState<"all" | "both" | "only_me" | "only_them">("all");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("genre");
  const [selectedNode, setSelectedNode] = useState<MovieNode | null>(null);
  const [highlightedPerson, setHighlightedPerson] = useState<string | null>(null);

  // Blend Computation
  const blend = useMemo(() => {
    return calculateMatchScore(
      viewerMovies as BlendMovie[],
      friendMovies as BlendMovie[]
    );
  }, [viewerMovies, friendMovies]);

  // Cinema Scores
  const viewerScore = useMemo(() => computeScore(viewerMovies), [viewerMovies]);
  const friendScore = useMemo(() => computeScore(friendMovies), [friendMovies]);

  // Node ring lookup table: coral = both, blue = only you, green = only them
  const nodeRings = useMemo(() => {
    const rings: Record<string, "coral" | "blue" | "green"> = {};
    blend.sharedMovies.forEach((m) => {
      rings[String(m.id)] = "coral";
    });
    blend.onlyMine.forEach((m) => {
      rings[String(m.id)] = "blue";
    });
    blend.onlyTheirs.forEach((m) => {
      rings[String(m.id)] = "green";
    });
    return rings;
  }, [blend]);

  // Filtered nodes for the MetroMap
  const filteredNodes = useMemo(() => {
    if (filterMode === "both") {
      return blend.sharedMovies as MovieNode[];
    }
    if (filterMode === "only_me") {
      return blend.onlyMine as MovieNode[];
    }
    if (filterMode === "only_them") {
      return blend.onlyTheirs as MovieNode[];
    }
    // "all" - combine shared + mine + theirs
    return [...blend.sharedMovies, ...blend.onlyMine, ...blend.onlyTheirs] as MovieNode[];
  }, [blend, filterMode]);

  // Build the blended map graph
  const blendedGraph = useMemo(() => {
    return rebuildFullGraph(filteredNodes, [], connectionMode);
  }, [filteredNodes, connectionMode]);

  // Strips sorted by viewer's genre affinity
  const theySeenYouHavent = useMemo(() => {
    return sortMoviesByGenreAffinity(blend.onlyTheirs, blend.genreAffinity);
  }, [blend.onlyTheirs, blend.genreAffinity]);

  const youSeenTheyHavent = useMemo(() => {
    return sortMoviesByGenreAffinity(blend.onlyMine, blend.genreAffinity);
  }, [blend.onlyMine, blend.genreAffinity]);

  // "Watch Together" AI Recommendations
  const [watchTogetherPicks, setWatchTogetherPicks] = useState<ResolvedRecommendation[]>([]);
  const [watchTogetherLoading, setWatchTogetherLoading] = useState(false);
  const [watchTogetherError, setWatchTogetherError] = useState<string | null>(null);
  const [hasRequestedWatchTogether, setHasRequestedWatchTogether] = useState(false);

  const handleFetchWatchTogether = useCallback(async () => {
    setWatchTogetherLoading(true);
    setWatchTogetherError(null);
    setHasRequestedWatchTogether(true);

    try {
      // Collect shared movies + top rated from both, capped at 12
      const candidateList: BlendMovie[] = [...blend.sharedMovies];

      const myTopRated = [...viewerMovies]
        .filter((m) => typeof m.myRating === "number" && m.myRating > 0)
        .sort((a, b) => (b.myRating || 0) - (a.myRating || 0));

      const theirTopRated = [...friendMovies]
        .filter((m) => typeof m.myRating === "number" && m.myRating > 0)
        .sort((a, b) => (b.myRating || 0) - (a.myRating || 0));

      for (const m of myTopRated) {
        if (candidateList.length >= 12) break;
        if (!candidateList.some((c) => String(c.id) === String(m.id))) {
          candidateList.push(m as BlendMovie);
        }
      }

      for (const m of theirTopRated) {
        if (candidateList.length >= 12) break;
        if (!candidateList.some((c) => String(c.id) === String(m.id))) {
          candidateList.push(m as BlendMovie);
        }
      }

      // If still fewer than 3, add more from viewer/friend movies
      if (candidateList.length < 3) {
        for (const m of [...viewerMovies, ...friendMovies]) {
          if (candidateList.length >= 12) break;
          if (!candidateList.some((c) => String(c.id) === String(m.id))) {
            candidateList.push(m as BlendMovie);
          }
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchedMovies: candidateList.map((m) => ({
            id: m.id,
            title: m.title,
            year: m.year,
            genres: m.genres,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.error) {
        throw new Error(data?.error || `Recommendation failed (${res.status})`);
      }

      const recs: ResolvedRecommendation[] = data.recommendations || [];
      // Slice to 3 picks
      setWatchTogetherPicks(recs.slice(0, 3));
    } catch (err: unknown) {
      console.error("Watch Together recommendation error:", err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      setWatchTogetherError(
        isAbort
          ? "Recommendation service timed out. Please try again."
          : "Could not fetch recommendations at this time."
      );
    } finally {
      setWatchTogetherLoading(false);
    }
  }, [blend.sharedMovies, viewerMovies, friendMovies]);

  // Load Watch Together automatically once on mount
  useEffect(() => {
    if (!hasRequestedWatchTogether && (viewerMovies.length > 0 || friendMovies.length > 0)) {
      handleFetchWatchTogether();
    }
  }, [hasRequestedWatchTogether, handleFetchWatchTogether, viewerMovies.length, friendMovies.length]);

  // Add to my map action
  const [addedMap, setAddedMap] = useState<Record<string, boolean>>({});
  const [addingId, setAddingId] = useState<string | number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const handleAddToMyMap = async (movie: BlendMovie | ResolvedRecommendation) => {
    const idKey = String(movie.id);
    setAddingId(movie.id);

    try {
      const nodeToSave: MovieNode = {
        id: String(movie.id),
        title: movie.title,
        year: movie.year || "",
        posterPath: movie.posterPath || null,
        genres: movie.genres || [],
        status: "watched",
        addedAt: Date.now(),
        watchedOn: new Date().toISOString().split("T")[0],
        overview: movie.overview || "",
        decade: undefined,
        myRating: null,
        myNote: null,
      };

      await saveMovie(viewerProfile.id, nodeToSave);

      setAddedMap((prev) => ({ ...prev, [idKey]: true }));
      showToast(`Added "${movie.title}" to your map!`);
    } catch (err) {
      console.error("Failed to add movie to map:", err);
      showToast("Could not add movie to map");
    } finally {
      setAddingId(null);
    }
  };

  // Share Modal & OG Download state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);

  const handleCopyBlendLink = () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/blend/${friendProfile.username}`
        : `/blend/${friendProfile.username}`;

    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      showToast("Blend link copied to clipboard!");
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const handleDownloadBlendCard = async () => {
    setIsDownloadingCard(true);
    try {
      const res = await fetch(`/blend/${friendProfile.username}/opengraph-image`);
      if (!res.ok) throw new Error("Card download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eclipse-blend-${viewerProfile.username}-${friendProfile.username}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Blend card downloaded!");
    } catch (err) {
      console.error("Failed to download card:", err);
      showToast("Could not download blend card");
    } finally {
      setIsDownloadingCard(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-[#0F0F12] text-[#F2F2F3] overflow-x-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#17171C] border border-[#26262D] shadow-2xl text-xs sm:text-sm text-[#F2F2F3]"
          >
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BLEND HERO HEADER */}
      <div className="bg-[#17171C] border-b border-[#26262D] px-4 py-6 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left: Avatars + Names */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center -space-x-3">
              {/* Viewer Avatar */}
              <div
                className="w-14 h-14 rounded-full bg-[#0F0F12] border-2 border-[#38BDF8] flex items-center justify-center text-lg font-bold text-[#38BDF8] shadow-lg z-10"
                title={`You (${viewerProfile.displayName})`}
              >
                {viewerProfile.displayName.charAt(0).toUpperCase()}
              </div>

              {/* Friend Avatar */}
              <div
                className="w-14 h-14 rounded-full bg-[#0F0F12] border-2 border-[#34D399] flex items-center justify-center text-lg font-bold text-[#34D399] shadow-lg"
                title={`${friendProfile.displayName} (@${friendProfile.username})`}
              >
                {friendProfile.displayName.charAt(0).toUpperCase()}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-extrabold text-[#F2F2F3] tracking-tight">
                  You × @{friendProfile.username}
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[#FF5A4F]/10 text-[#FF5A4F] border border-[#FF5A4F]/20">
                  Movie Blend
                </span>
              </div>
              <p className="text-xs text-[#8B8B95] mt-1">
                Comparing movie tastes between {viewerProfile.displayName} and {friendProfile.displayName}
              </p>

              {/* Scores & Badges */}
              <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#0F0F12] border border-[#26262D]">
                  <span className="w-2 h-2 rounded-full bg-[#38BDF8]" />
                  <span className="text-[#8B8B95]">You:</span>
                  <span className="font-semibold text-[#F2F2F3]">
                    {viewerScore.level.name} · {viewerScore.total} pts
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#0F0F12] border border-[#26262D]">
                  <span className="w-2 h-2 rounded-full bg-[#34D399]" />
                  <span className="text-[#8B8B95]">@{friendProfile.username}:</span>
                  <span className="font-semibold text-[#F2F2F3]">
                    {friendScore.level.name} · {friendScore.total} pts
                  </span>
                </div>
              </div>

              {friendScore.topBadges.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-[10px] text-[#8B8B95] uppercase font-semibold">
                    Top Badges:
                  </span>
                  {friendScore.topBadges.map((badge: BadgeInfo) => {
                    const IconComponent = BADGE_ICONS[badge.iconName] || Trophy;
                    return (
                      <span
                        key={badge.id}
                        title={`${badge.name}: ${badge.description}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#0F0F12] border border-[#26262D] text-[11px] font-medium text-[#F2F2F3]"
                      >
                        <IconComponent className="w-3 h-3 text-[#34D399]" />
                        <span>{badge.name}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Center/Right: Match % + Stats */}
          <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
            {/* Big Match Score */}
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-black text-[#FF5A4F] tracking-tight">
                  {blend.matchScore}%
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#8B8B95]">
                  Compatibility
                </div>
              </div>
              <div className="h-9 w-px bg-[#26262D]" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#F2F2F3]">
                  {blend.matchLabel}
                </span>
                <span className="text-[11px] text-[#8B8B95]">
                  Taste similarity score
                </span>
              </div>
            </div>

            {/* Counts Row */}
            <div className="flex items-center gap-2.5 bg-[#0F0F12] px-3.5 py-2 rounded-xl border border-[#26262D] text-xs">
              <div className="flex items-center gap-1.5" title="Watched by both of you">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A4F]" />
                <span className="font-semibold text-[#F2F2F3]">{blend.sharedMovies.length}</span>
                <span className="text-[#8B8B95] hidden sm:inline">Shared</span>
              </div>
              <span className="text-[#8B8B95]/40">•</span>
              <div className="flex items-center gap-1.5" title="Watched only by you">
                <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />
                <span className="font-semibold text-[#F2F2F3]">{blend.onlyMine.length}</span>
                <span className="text-[#8B8B95] hidden sm:inline">You</span>
              </div>
              <span className="text-[#8B8B95]/40">•</span>
              <div className="flex items-center gap-1.5" title={`Watched only by ${friendProfile.displayName}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-[#34D399]" />
                <span className="font-semibold text-[#F2F2F3]">{blend.onlyTheirs.length}</span>
                <span className="text-[#8B8B95] hidden sm:inline">Them</span>
              </div>
            </div>

            {/* Share Blend Button */}
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#26262D] hover:bg-[#383842] text-[#F2F2F3] border border-[#26262D] transition-colors shadow-sm ml-auto sm:ml-0"
            >
              <Share2 className="w-3.5 h-3.5 text-[#FF5A4F]" />
              <span>Share Blend</span>
            </button>
          </div>
        </div>
      </div>

      {/* FILTER & REGROUP TOOLBAR */}
      <div className="px-4 py-2.5 bg-[#0F0F12] border-b border-[#26262D] flex items-center justify-between gap-4 flex-wrap">
        {/* Left: Filter Toggle (All / Both / Only you / Only them) */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8B8B95]">
            Filter:
          </span>
          <div className="flex items-center p-0.5 rounded-xl bg-[#17171C] border border-[#26262D]">
            {(
              [
                { id: "all", label: `All (${filteredNodes.length})` },
                { id: "both", label: `Both (${blend.sharedMovies.length})` },
                { id: "only_me", label: `Only you (${blend.onlyMine.length})` },
                { id: "only_them", label: `Only them (${blend.onlyTheirs.length})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMode(f.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterMode === f.id
                    ? "bg-[#26262D] text-[#F2F2F3] shadow-sm font-semibold"
                    : "text-[#8B8B95] hover:text-[#F2F2F3]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Ring Color Legend */}
        <div className="flex items-center gap-3 text-xs bg-[#17171C] px-3 py-1 rounded-xl border border-[#26262D]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8B8B95]">
            Rings:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-[#FF5A4F]" />
            <span className="text-[11px] text-[#F2F2F3]">Both watched</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-[#38BDF8]" />
            <span className="text-[11px] text-[#F2F2F3]">Only you</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-[#34D399]" />
            <span className="text-[11px] text-[#F2F2F3]">Only @{friendProfile.username}</span>
          </div>
        </div>

        {/* Right: Regroup chips */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8B8B95]">
            Group:
          </span>
          <div className="flex items-center p-0.5 rounded-xl bg-[#17171C] border border-[#26262D]">
            {(["genre", "director", "decade", "cast"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setConnectionMode(m)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                  connectionMode === m
                    ? "bg-[#26262D] text-[#FF5A4F] shadow-sm font-semibold"
                    : "text-[#8B8B95] hover:text-[#F2F2F3]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BLENDED METRO MAP CANVAS */}
      <div className="relative w-full h-[540px] border-b border-[#26262D] overflow-hidden bg-[#0F0F12]">
        {filteredNodes.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-3">
            <Film className="w-12 h-12 text-[#26262D]" />
            <h3 className="text-base font-bold text-[#F2F2F3]">
              No movies in this filter
            </h3>
            <p className="text-xs text-[#8B8B95] max-w-sm">
              Try switching back to &ldquo;All&rdquo; to explore the blended movie network.
            </p>
          </div>
        ) : (
          <MetroMap
            watchedNodes={blendedGraph.watchedNodes}
            recommendedNodes={[]}
            connectionMode={connectionMode}
            onSelectNode={(node) => setSelectedNode(node)}
            selectedNodeId={selectedNode?.id}
            highlightedPerson={highlightedPerson}
            readOnly={true}
            nodeRings={nodeRings}
          />
        )}
      </div>

      {/* HORIZONTAL POSTER STRIPS & WATCH TOGETHER SECTION */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-10">
        {/* Strip 1: They've seen, you haven't */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#34D399]" />
                <h2 className="text-base font-bold text-[#F2F2F3]">
                  They&apos;ve seen, you haven&apos;t ({theySeenYouHavent.length})
                </h2>
              </div>
              <p className="text-xs text-[#8B8B95] mt-0.5">
                Top picks from @{friendProfile.username}&apos;s map matching genres you watch most.
              </p>
            </div>
          </div>

          {theySeenYouHavent.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#17171C] border border-[#26262D] text-xs text-[#8B8B95] text-center">
              You&apos;ve watched everything @{friendProfile.username} has seen! Complete overlap.
            </div>
          ) : (
            <div className="flex items-start gap-3.5 overflow-x-auto pb-3 pt-1 scrollbar-thin">
              {theySeenYouHavent.map((movie) => {
                const idKey = String(movie.id);
                const isAdded = !!addedMap[idKey];
                const isAdding = addingId === movie.id;

                return (
                  <div
                    key={movie.id}
                    className="flex-shrink-0 w-36 rounded-2xl bg-[#17171C] border border-[#26262D] overflow-hidden p-2.5 flex flex-col justify-between hover:border-[#34D399]/40 transition-all shadow-card group"
                  >
                    <div>
                      {/* Poster image with green ring */}
                      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-[#0F0F12] border-2 border-[#34D399] mb-2">
                        {movie.posterPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://image.tmdb.org/t/p/w185${movie.posterPath}`}
                            alt={movie.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-2 text-center text-[10px] text-[#8B8B95]">
                            {movie.title}
                          </div>
                        )}

                        {/* Friend's rating badge */}
                        {typeof movie.theirRating === "number" && movie.theirRating > 0 && (
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#0F0F12]/90 border border-amber-400/40 text-amber-400 font-bold text-[10px] flex items-center gap-0.5 shadow-sm">
                            <Star className="w-2.5 h-2.5 fill-amber-400" />
                            <span>{movie.theirRating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>

                      {/* Title & Year */}
                      <h4 className="text-xs font-bold text-[#F2F2F3] line-clamp-1 group-hover:text-[#34D399] transition-colors">
                        {movie.title}
                      </h4>
                      <p className="text-[10px] text-[#8B8B95] font-mono mt-0.5">
                        {movie.year || "Unknown"}
                      </p>
                    </div>

                    {/* Add to my map button */}
                    <div className="mt-2.5 pt-2 border-t border-[#26262D]">
                      <button
                        type="button"
                        onClick={() => handleAddToMyMap(movie)}
                        disabled={isAdded || isAdding}
                        className={`w-full inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                          isAdded
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                            : "bg-[#26262D] hover:bg-[#383842] text-[#F2F2F3] border border-[#26262D]"
                        }`}
                      >
                        {isAdding ? (
                          <Loader2 className="w-3 h-3 animate-spin text-[#FF5A4F]" />
                        ) : isAdded ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3 text-[#FF5A4F]" />
                            <span>Add to map</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Strip 2: You've seen, they haven't */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#38BDF8]" />
                <h2 className="text-base font-bold text-[#F2F2F3]">
                  You&apos;ve seen, they haven&apos;t ({youSeenTheyHavent.length})
                </h2>
              </div>
              <p className="text-xs text-[#8B8B95] mt-0.5">
                Movies you can recommend to @{friendProfile.username}.
              </p>
            </div>
          </div>

          {youSeenTheyHavent.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#17171C] border border-[#26262D] text-xs text-[#8B8B95] text-center">
              @{friendProfile.username} has watched all the movies on your map!
            </div>
          ) : (
            <div className="flex items-start gap-3.5 overflow-x-auto pb-3 pt-1 scrollbar-thin">
              {youSeenTheyHavent.map((movie) => (
                <div
                  key={movie.id}
                  className="flex-shrink-0 w-36 rounded-2xl bg-[#17171C] border border-[#26262D] overflow-hidden p-2.5 flex flex-col justify-between hover:border-[#38BDF8]/40 transition-all shadow-card group"
                >
                  <div>
                    {/* Poster image with blue ring */}
                    <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-[#0F0F12] border-2 border-[#38BDF8] mb-2">
                      {movie.posterPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://image.tmdb.org/t/p/w185${movie.posterPath}`}
                          alt={movie.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-2 text-center text-[10px] text-[#8B8B95]">
                          {movie.title}
                        </div>
                      )}

                      {/* Your rating badge */}
                      {typeof movie.myRating === "number" && movie.myRating > 0 && (
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-[#0F0F12]/90 border border-amber-400/40 text-amber-400 font-bold text-[10px] flex items-center gap-0.5 shadow-sm">
                          <Star className="w-2.5 h-2.5 fill-amber-400" />
                          <span>{movie.myRating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>

                    {/* Title & Year */}
                    <h4 className="text-xs font-bold text-[#F2F2F3] line-clamp-1 group-hover:text-[#38BDF8] transition-colors">
                      {movie.title}
                    </h4>
                    <p className="text-[10px] text-[#8B8B95] font-mono mt-0.5">
                      {movie.year || "Unknown"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* "WATCH TOGETHER" CARD */}
        <div className="bg-[#17171C] border border-[#26262D] rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#FF5A4F]/10 text-[#FF5A4F] flex items-center justify-center border border-[#FF5A4F]/20">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-bold text-[#F2F2F3]">
                  Watch Together Recommendations
                </h3>
              </div>
              <p className="text-xs text-[#8B8B95] mt-1 max-w-xl">
                AI picks tailored to bridge both of your tastes, balancing movies you both enjoy with top-rated favorites.
              </p>
            </div>

            <button
              type="button"
              onClick={handleFetchWatchTogether}
              disabled={watchTogetherLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26262D] hover:bg-[#383842] text-[#F2F2F3] transition-colors self-start sm:self-auto disabled:opacity-50"
            >
              {watchTogetherLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5A4F]" />
                  <span>Thinking...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-[#FF5A4F]" />
                  <span>Refresh picks</span>
                </>
              )}
            </button>
          </div>

          {/* Recommendations Content */}
          {watchTogetherLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-[#0F0F12] border border-[#26262D] p-4 flex gap-3 animate-pulse"
                >
                  <div className="w-20 aspect-[2/3] rounded-xl bg-[#26262D]" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 w-3/4 rounded bg-[#26262D]" />
                    <div className="h-3 w-1/2 rounded bg-[#26262D]" />
                    <div className="h-10 w-full rounded bg-[#26262D] mt-2" />
                  </div>
                </div>
              ))}
            </div>
          ) : watchTogetherError ? (
            <div className="p-6 rounded-2xl bg-[#0F0F12] border border-red-500/30 text-xs text-red-400 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{watchTogetherError}</span>
              </div>
              <button
                type="button"
                onClick={handleFetchWatchTogether}
                className="px-3 py-1.5 rounded-lg bg-[#26262D] text-[#F2F2F3] text-xs font-semibold hover:bg-[#383842] transition-colors"
              >
                Retry
              </button>
            </div>
          ) : watchTogetherPicks.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#0F0F12] border border-[#26262D] text-xs text-[#8B8B95] text-center">
              Add at least 3 movies to your map to unlock personalized Watch Together picks.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {watchTogetherPicks.map((pick) => {
                const idKey = String(pick.id);
                const isAdded = !!addedMap[idKey];
                const isAdding = addingId === pick.id;

                return (
                  <div
                    key={pick.id}
                    className="rounded-2xl bg-[#0F0F12] border border-[#26262D] hover:border-[#FF5A4F]/40 p-4 flex flex-col justify-between transition-all shadow-card group"
                  >
                    <div className="flex gap-3.5">
                      {/* Poster */}
                      <div className="w-20 aspect-[2/3] rounded-xl overflow-hidden bg-[#17171C] border border-[#26262D] flex-shrink-0">
                        {pick.posterPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://image.tmdb.org/t/p/w185${pick.posterPath}`}
                            alt={pick.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center p-1 text-[9px] text-[#8B8B95] text-center">
                            {pick.title}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              pick.kind === "stretch"
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-[#FF5A4F]/15 text-[#FF5A4F] border border-[#FF5A4F]/30"
                            }`}
                          >
                            {pick.kind === "stretch" ? "Stretch Pick" : "Similar Pick"}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-[#F2F2F3] line-clamp-1 group-hover:text-[#FF5A4F] transition-colors">
                          {pick.title}
                        </h4>
                        <span className="text-[11px] text-[#8B8B95] font-mono">
                          {pick.year || "Unknown"}
                        </span>

                        <p className="text-[11px] text-[#8B8B95] line-clamp-3 mt-2 leading-relaxed">
                          {pick.reason}
                        </p>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="mt-4 pt-3 border-t border-[#26262D] flex items-center justify-between gap-2">
                      <span className="text-[10px] text-[#8B8B95] line-clamp-1">
                        Connects to: <strong className="text-[#F2F2F3]">{pick.connectsTo}</strong>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleAddToMyMap(pick)}
                        disabled={isAdded || isAdding}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0 ${
                          isAdded
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                            : "bg-[#FF5A4F] hover:bg-[#E84E44] text-white shadow-subtle"
                        }`}
                      >
                        {isAdding ? (
                          <Loader2 className="w-3 h-3 animate-spin text-white" />
                        ) : isAdded ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* READ-ONLY MOVIE DETAIL PANEL */}
      <AnimatePresence>
        {selectedNode && (
          <MovieDetailPanel
            movieNode={selectedNode}
            allMapNodes={blendedGraph.nodes}
            onClose={() => setSelectedNode(null)}
            onSelectConnectedMovie={(node) => setSelectedNode(node)}
            onHighlightPerson={(person) => setHighlightedPerson(person)}
            activeHighlightedPerson={highlightedPerson}
            readOnly={true}
          />
        )}
      </AnimatePresence>

      {/* SHARE BLEND MODAL */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="w-full max-w-lg bg-[#17171C] border border-[#26262D] rounded-2xl p-6 shadow-2xl relative"
            >
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-[#F2F2F3]">
                    Share Movie Blend
                  </h3>
                  <p className="text-xs text-[#8B8B95] mt-1">
                    Share your {blend.matchScore}% taste compatibility card with friends.
                  </p>
                </div>

                {/* Card Preview */}
                <div className="relative rounded-xl overflow-hidden border border-[#26262D] bg-[#0F0F12] aspect-[1200/630] shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/blend/${friendProfile.username}/opengraph-image`}
                    alt="Blend Card Preview"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Blend Link & Copy */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-[#8B8B95] uppercase tracking-wider">
                    Blend Page Link
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={
                        typeof window !== "undefined"
                          ? `${window.location.origin}/blend/${friendProfile.username}`
                          : `/blend/${friendProfile.username}`
                      }
                      className="flex-1 bg-[#0F0F12] border border-[#26262D] rounded-xl px-3 py-2 text-xs text-[#F2F2F3] font-mono select-all focus:outline-none focus:border-[#FF5A4F]"
                    />
                    <button
                      type="button"
                      onClick={handleCopyBlendLink}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#26262D] hover:bg-[#383842] text-[#F2F2F3] transition-colors shadow-sm flex-shrink-0"
                    >
                      {shareCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#8B8B95]" />
                          <span>Copy link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#26262D]">
                  <button
                    type="button"
                    onClick={handleDownloadBlendCard}
                    disabled={isDownloadingCard}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors shadow-subtle disabled:opacity-50"
                  >
                    {isDownloadingCard ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download blend card</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
