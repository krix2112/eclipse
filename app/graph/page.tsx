"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Info,
  Cloud,
  Sparkles,
  Film,
  Share2,
  Copy,
  Download,
  ExternalLink,
  X,
  Check,
  Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { forceCollide } from "d3-force";
import MovieSearch from "@/components/MovieSearch";
import MetroMap from "@/components/MetroMap";
import MovieDetailPanel from "@/components/MovieDetailPanel";
import ScorePanel from "@/components/ScorePanel";
import { useGraph } from "@/hooks/useGraph";
import { useUser } from "@/hooks/useUser";
import type { MovieNode, MovieLink, ConnectionMode } from "@/lib/graph";
import type { MovieSearchResult, MovieDetails } from "@/lib/tmdb";
import type { ResolvedRecommendation } from "@/app/api/recommend/route";
import { computeScore } from "@/lib/score";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-[#8B8B95] gap-3">
      <Loader2 className="w-6 h-6 text-[#FF5A4F] animate-spin" />
      <span className="text-xs">Loading map view...</span>
    </div>
  ),
});

const POSTER_WIDTH = 32;
const POSTER_HEIGHT = 48;
const POSTER_RADIUS = 4;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * Movie Map Graph Page
 * Redesigned with charcoal/coral theme, poster nodes, connection filter chips,
 * and robust AI recommendations with failover.
 */
export default function GraphPage() {
  const { user, profile, loading: authLoading } = useUser();
  const {
    graph,
    watchedNodes,
    recommendedNodes,
    connectionMode,
    setConnectionMode,
    addMovie,
    removeMovie,
    addRecommendations,
    dismissRecommendation,
    markAsWatched,
    updateRatingAndNote,
    updateWatchedOn,
    isLoaded,
    syncError,
  } = useGraph();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const [selectedNode, setSelectedNode] = useState<MovieNode | null>(null);
  const [viewMode, setViewMode] = useState<"metro" | "network">("metro");
  const [highlightedPerson, setHighlightedPerson] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRecommending, setIsRecommending] = useState(false);
  const [, setCanvasTick] = useState(0);

  // Cinema Score state & level-up / badge unlock detection
  const [showScorePanel, setShowScorePanel] = useState(false);
  const cinemaScore = useMemo(() => computeScore(watchedNodes), [watchedNodes]);

  const prevScoreRef = useRef<{
    levelName: string;
    total: number;
    earnedBadgeIds: Set<string>;
    initialized: boolean;
  }>({
    levelName: "",
    total: 0,
    earnedBadgeIds: new Set(),
    initialized: false,
  });

  // Share Modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);

  const handleCopyShareLink = () => {
    if (!profile?.username) return;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/u/${profile.username}`
        : `/u/${profile.username}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      showToast("Profile link copied!");
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const handleDownloadShareCard = async () => {
    if (!profile?.username || isDownloadingCard) return;
    setIsDownloadingCard(true);
    try {
      const res = await fetch(`/u/${profile.username}/opengraph-image`);
      if (!res.ok) throw new Error("Failed to load share card");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eclipse-${profile.username}-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Share card downloaded!");
    } catch (err) {
      console.error("Card download failed:", err);
      showToast("Could not download share card");
    } finally {
      setIsDownloadingCard(false);
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((prev) => (prev === message ? null : prev));
    }, 3500);
  };

  useEffect(() => {
    if (syncError) {
      showToast(syncError);
    }
  }, [syncError]);

  // Detect Level Up & New Badge Unlock (subtle toast, no confetti)
  useEffect(() => {
    if (!isLoaded) return;

    if (!prevScoreRef.current.initialized) {
      prevScoreRef.current = {
        levelName: cinemaScore.level.name,
        total: cinemaScore.total,
        earnedBadgeIds: new Set(
          cinemaScore.badges.filter((b) => b.earned).map((b) => b.id)
        ),
        initialized: true,
      };
      return;
    }

    // Check level up
    if (
      cinemaScore.level.name !== prevScoreRef.current.levelName &&
      cinemaScore.total > prevScoreRef.current.total
    ) {
      showToast(`Level up! You are now a ${cinemaScore.level.name}`);
    }

    // Check newly unlocked badges
    const newBadges = cinemaScore.badges.filter(
      (b) => b.earned && !prevScoreRef.current.earnedBadgeIds.has(b.id)
    );
    if (newBadges.length > 0) {
      showToast(`Badge Unlocked: ${newBadges[0].name}`);
    }

    prevScoreRef.current = {
      levelName: cinemaScore.level.name,
      total: cinemaScore.total,
      earnedBadgeIds: new Set(
        cinemaScore.badges.filter((b) => b.earned).map((b) => b.id)
      ),
      initialized: true,
    };
  }, [cinemaScore, isLoaded]);

  // Configure collision spacing and auto zoom-to-fit
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    // Apply d3-force collision to prevent poster overlap
    fg.d3Force("collide", forceCollide(34));
    fg.d3Force("charge")?.strength(-320);
    fg.d3Force("link")?.distance(95);

    // Auto zoom-to-fit with gentle delay for layout stabilization
    const timer = setTimeout(() => {
      fg.zoomToFit(400, 50);
    }, 300);

    return () => clearTimeout(timer);
  }, [graph.nodes.length, connectionMode]);

  // Pending Movie Add Confirm state ("When did you watch it?")
  const [pendingAddDetails, setPendingAddDetails] = useState<MovieDetails | null>(null);
  const [pendingWatchedDate, setPendingWatchedDate] = useState<string>("");
  const [isNotSureDate, setIsNotSureDate] = useState(false);

  // Handle selecting a movie from MovieSearch
  const handleMovieSelect = async (movie: MovieSearchResult) => {
    try {
      const response = await fetch(`/api/movies/${movie.id}`);
      if (response.ok) {
        const details: MovieDetails = await response.json();
        const today = new Date().toISOString().split("T")[0];
        setPendingWatchedDate(today);
        setIsNotSureDate(false);
        setPendingAddDetails(details);
      } else {
        showToast(`Could not fetch details for ${movie.title}`);
      }
    } catch (err: unknown) {
      console.error("Failed to add movie:", err);
      showToast(`Error adding ${movie.title}`);
    }
  };

  // Confirm adding movie with chosen watchedOn date
  const handleConfirmAddMovie = () => {
    if (!pendingAddDetails) return;
    const finalWatchedOn = isNotSureDate
      ? (pendingAddDetails.release_year || new Date().getFullYear().toString())
      : pendingWatchedDate || new Date().toISOString().split("T")[0];

    addMovie(pendingAddDetails, finalWatchedOn);
    showToast(`Added ${pendingAddDetails.title}`);
    setPendingAddDetails(null);
  };

  const handleNotSureClick = () => {
    const yr = pendingAddDetails?.release_year || new Date().getFullYear().toString();
    setPendingWatchedDate(yr);
    setIsNotSureDate(true);
  };

  // AI recommendations handler with strict timeout and button re-enable
  const handleRequestRecommendations = async () => {
    if (watchedNodes.length < 3 || isRecommending) return;

    setIsRecommending(true);
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          watchedMovies: watchedNodes.map((n) => ({
            id: n.id,
            title: n.title,
            year: n.year,
            genres: n.genres,
          })),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data || data.error) {
        showToast(data?.error || `Recommendation failed (${response.status})`);
        return;
      }

      const recs: ResolvedRecommendation[] = data.recommendations || [];
      if (recs.length > 0) {
        addRecommendations(recs);
        showToast(`${recs.length} new recommendations`);
      } else {
        showToast("No new recommendations found at this time");
      }
    } catch (err: unknown) {
      console.error("Failed to request recommendations:", err);
      showToast("Error contacting recommendation service");
    } finally {
      setIsRecommending(false);
    }
  };

  // Removal
  const handleRemoveMovie = (node: MovieNode) => {
    removeMovie(node.id);
    setSelectedNode(null);
    showToast(`Removed ${node.title}`);
  };

  // Mark R node as watched
  const handleMarkAsWatched = (node: MovieNode) => {
    markAsWatched(node.id);
    setSelectedNode(null);
    showToast(`Added ${node.title} to watched map`);
  };

  // Dismiss R node
  const handleDismissRecommendation = (node: MovieNode) => {
    dismissRecommendation(node.id);
    setSelectedNode(null);
    showToast("Dismissed recommendation");
  };

  // Add movie directly by TMDB ID (e.g. from "More like this")
  const handleAddMovieById = async (tmdbId: number) => {
    try {
      const response = await fetch(`/api/movies/${tmdbId}`);
      if (response.ok) {
        const details: MovieDetails = await response.json();
        const today = new Date().toISOString().split("T")[0];
        setPendingWatchedDate(today);
        setIsNotSureDate(false);
        setPendingAddDetails(details);
      } else {
        showToast("Could not fetch movie details");
      }
    } catch (err: unknown) {
      console.error("Failed to add movie:", err);
      showToast("Error adding movie to map");
    }
  };

  // Update personal rating and note
  const handleUpdateRatingAndNote = (
    id: string | number,
    rating: number | null,
    note: string | null
  ) => {
    updateRatingAndNote(id, rating, note);
    setSelectedNode((prev) =>
      prev && String(prev.id) === String(id)
        ? { ...prev, myRating: rating, myNote: note }
        : prev
    );
  };

  // Update watchedOn date
  const handleUpdateWatchedOn = (id: string | number, watchedOn: string) => {
    updateWatchedOn(id, watchedOn);
    setSelectedNode((prev) =>
      prev && String(prev.id) === String(id)
        ? { ...prev, watchedOn }
        : prev
    );
  };

  const movieCount = watchedNodes.length;
  const recCount = recommendedNodes.length;
  const genreCount = new Set(watchedNodes.flatMap((n) => n.genres.map((g) => g.name))).size;
  const bridgeCount = graph.links.filter((l) => l.type === "bridge").length;
  const canRecommend = watchedNodes.length >= 3;

  return (
    <div className="relative flex-1 flex flex-col bg-[#0F0F12] text-[#F2F2F3] overflow-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#17171C] border border-[#26262D] shadow-card text-xs sm:text-sm text-[#F2F2F3] max-w-md"
          >
            <CheckCircle2 className="w-4 h-4 text-[#FF5A4F] flex-shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cloud Sync Status Banner (Only shown when auth check is complete and no user is signed in) */}
      {!user && !authLoading && isLoaded && (
        <div className="w-full bg-[#17171C] border-b border-[#26262D] px-4 py-2 flex items-center justify-between text-xs text-[#8B8B95] z-20">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-[#FF5A4F] flex-shrink-0" />
            <span>Sign in to save your map to the cloud.</span>
          </div>
          <Link
            href="/login"
            className="text-xs font-semibold text-[#FF5A4F] hover:underline underline-offset-4 transition-colors"
          >
            Sign in &rarr;
          </Link>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="w-full border-b border-[#26262D] bg-[#17171C] px-4 sm:px-6 py-2.5 z-20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-[#8B8B95] hover:text-[#F2F2F3] px-2.5 py-1.5 rounded-lg hover:bg-[#26262D] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
          <div className="h-4 w-[1px] bg-[#26262D]" />

          {/* Cinema Score Pill */}
          <button
            type="button"
            onClick={() => setShowScorePanel(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-[#0F0F12] hover:bg-[#26262D] text-[#F2F2F3] border border-[#26262D] transition-colors shadow-sm"
            title="View Cinema Score and Badges"
          >
            <Trophy className="w-3.5 h-3.5 text-[#FF5A4F]" />
            <span>{cinemaScore.level.name} · {cinemaScore.total} pts</span>
          </button>

          {/* Metric Counter */}
          <div className="text-xs text-[#8B8B95] font-medium hidden sm:inline-flex items-center gap-1.5">
            <span className="text-[#F2F2F3] font-semibold">{movieCount}</span>
            <span>{movieCount === 1 ? "movie" : "movies"}</span>
            <span>•</span>
            <span className="text-[#F2F2F3] font-semibold">{genreCount}</span>
            <span>{genreCount === 1 ? "genre" : "genres"}</span>
            <span>•</span>
            <span className="text-[#F2F2F3] font-semibold">{bridgeCount}</span>
            <span>{bridgeCount === 1 ? "bridge" : "bridges"}</span>
            {recCount > 0 && (
              <>
                <span>•</span>
                <span className="text-[#FF5A4F] font-semibold">{recCount}</span>
                <span>{recCount === 1 ? "recommendation" : "recommendations"}</span>
              </>
            )}
          </div>
        </div>

        {/* Center: View Toggle (Metro | Network) & Grouping Filter Chips */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1 bg-[#0F0F12] p-1 rounded-xl border border-[#26262D]">
            <button
              type="button"
              onClick={() => setViewMode("metro")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "metro"
                  ? "bg-[#FF5A4F] text-white shadow-sm"
                  : "text-[#8B8B95] hover:text-[#F2F2F3]"
              }`}
            >
              Metro
            </button>
            <button
              type="button"
              onClick={() => setViewMode("network")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "network"
                  ? "bg-[#26262D] text-[#F2F2F3] shadow-sm"
                  : "text-[#8B8B95] hover:text-[#F2F2F3]"
              }`}
            >
              Network
            </button>
          </div>

          <div className="flex items-center gap-1 bg-[#0F0F12] p-1 rounded-xl border border-[#26262D]">
            {(["genre", "director", "cast", "decade"] as const).map((mode: ConnectionMode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setConnectionMode(mode)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                  connectionMode === mode
                    ? "bg-[#26262D] text-[#FF5A4F] shadow-sm"
                    : "text-[#8B8B95] hover:text-[#F2F2F3]"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Share My Map Button (logged in only) */}
          {user && (
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#17171C] hover:bg-[#26262D] text-[#F2F2F3] border border-[#26262D] transition-all shadow-subtle flex-shrink-0"
              title="Share your movie map and card"
            >
              <Share2 className="w-3.5 h-3.5 text-[#FF5A4F]" />
              <span>Share my map</span>
            </button>
          )}

          {/* Recommend Next Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={handleRequestRecommendations}
              disabled={!canRecommend || isRecommending}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                canRecommend && !isRecommending
                  ? "bg-[#FF5A4F] hover:bg-[#E84E44] text-white border-transparent shadow-subtle"
                  : "bg-[#26262D] text-[#8B8B95]/60 border-transparent cursor-not-allowed"
              }`}
            >
              {isRecommending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Thinking...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                  <span>Recommend next</span>
                </>
              )}
            </button>

            {!canRecommend && (
              <div className="absolute right-0 top-full mt-2 hidden group-hover:block z-50 w-56 p-2 rounded-xl bg-[#17171C] border border-[#26262D] text-[11px] text-[#8B8B95] shadow-card">
                <div className="flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-[#FF5A4F] flex-shrink-0 mt-0.5" />
                  <span>Add at least 3 watched movies ({movieCount}/3) to get recommendations.</span>
                </div>
              </div>
            )}
          </div>

          {/* Search Input with dropdown filters */}
          <MovieSearch
            onSelect={handleMovieSelect}
            className="w-full sm:w-64 lg:w-72"
            placeholder="Add movie to map..."
          />
        </div>
      </div>

      {/* Main Graph Area */}
      <div className="relative flex-1 w-full h-[calc(100vh-8.5rem)] min-h-[500px]">
        {/* Loading state - Prevents flicker */}
        {(!isLoaded || authLoading) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-[#0F0F12]">
            <Loader2 className="w-8 h-8 text-[#FF5A4F] animate-spin mb-3" />
            <p className="text-xs font-medium text-[#8B8B95]">Loading movie map...</p>
          </div>
        )}

        {/* Empty state: friendly illustration-free message with search focused */}
        {isLoaded && !authLoading && watchedNodes.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center bg-[#0F0F12]">
            <div className="max-w-md w-full p-8 rounded-2xl bg-[#17171C] border border-[#26262D] shadow-card flex flex-col items-center text-center">
              <h2 className="text-xl font-bold text-[#F2F2F3] mb-2">Map your movie universe</h2>
              <p className="text-xs text-[#8B8B95] leading-relaxed mb-6">
                Search and add your first movie to establish your origin station and build your transit lines.
              </p>
              <MovieSearch
                onSelect={handleMovieSelect}
                autoFocus={true}
                placeholder="Search first movie (e.g. Inception)..."
                className="w-full"
              />
            </div>
          </div>
        )}

        {/* Main Visualization View (Metro default | Network) */}
        {isLoaded && !authLoading && watchedNodes.length > 0 && (
          <div className="absolute inset-0 z-0">
            {viewMode === "metro" ? (
              <MetroMap
                watchedNodes={watchedNodes}
                recommendedNodes={recommendedNodes}
                connectionMode={connectionMode}
                onSelectNode={(node) => setSelectedNode(node)}
                selectedNodeId={selectedNode?.id}
                highlightedPerson={highlightedPerson}
              />
            ) : (
              <ForceGraph2D
                ref={fgRef}
                graphData={graph}
                backgroundColor="#0F0F12"
                onBackgroundClick={() => setSelectedNode(null)}
                nodeRelSize={20}
                nodeLabel={(nodeItem: object) => (nodeItem as MovieNode).title}
                linkLabel={(linkItem: object) => (linkItem as MovieLink).reason}
                onNodeClick={(nodeItem: object) => setSelectedNode(nodeItem as MovieNode)}
                nodeCanvasObject={(
                  nodeItem: object,
                  ctx: CanvasRenderingContext2D
                ) => {
              const node = nodeItem as MovieNode;
              const x = (node.x ?? 0) - POSTER_WIDTH / 2;
              const y = (node.y ?? 0) - POSTER_HEIGHT / 2;

              ctx.save();

              // Base rounded card
              drawRoundedRect(ctx, x, y, POSTER_WIDTH, POSTER_HEIGHT, POSTER_RADIUS);
              ctx.fillStyle = "#17171C";
              ctx.fill();

              let imageDrawn = false;
              if (node.posterPath) {
                const imgUrl = `https://image.tmdb.org/t/p/w185${node.posterPath}`;
                let img = imageCache.current.get(imgUrl);

                if (!img) {
                  img = new Image();
                  img.crossOrigin = "anonymous";
                  img.src = imgUrl;
                  img.onload = () => {
                    setCanvasTick((t) => t + 1);
                  };
                  imageCache.current.set(imgUrl, img);
                }

                if (img.complete && img.naturalHeight !== 0) {
                  imageDrawn = true;
                  ctx.save();
                  drawRoundedRect(ctx, x, y, POSTER_WIDTH, POSTER_HEIGHT, POSTER_RADIUS);
                  ctx.clip();
                  ctx.drawImage(img, x, y, POSTER_WIDTH, POSTER_HEIGHT);
                  ctx.restore();
                }
              }

              // Fallback text if poster not yet ready
              if (!imageDrawn) {
                ctx.fillStyle = "#F2F2F3";
                ctx.font = "bold 6px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const cleanTitle =
                  node.title.length > 18 ? node.title.slice(0, 16) + "..." : node.title;
                ctx.fillText(cleanTitle, node.x ?? 0, node.y ?? 0);
                if (node.year) {
                  ctx.fillStyle = "#8B8B95";
                  ctx.font = "5px Inter, sans-serif";
                  ctx.fillText(node.year, node.x ?? 0, (node.y ?? 0) + 8);
                }
              }

              // Node Borders
              drawRoundedRect(ctx, x, y, POSTER_WIDTH, POSTER_HEIGHT, POSTER_RADIUS);
              if (node.status === "recommended") {
                ctx.strokeStyle = "#FF5A4F";
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 3]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Small "Similar" / "Stretch" tag on recommended poster
                const tagLabel = node.kind === "stretch" ? "Stretch" : "Similar";
                ctx.font = "bold 5px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                const metrics = ctx.measureText(tagLabel);
                const tagW = Math.max(metrics.width + 4, 18);
                const tagH = 8;
                const tagX = x + POSTER_WIDTH - tagW;
                const tagY = y;
                drawRoundedRect(ctx, tagX, tagY, tagW, tagH, 2);

                if (node.kind === "stretch") {
                  ctx.fillStyle = "#FF5A4F";
                  ctx.fill();
                  ctx.fillStyle = "#0F0F12";
                  ctx.fillText(tagLabel, tagX + tagW / 2, tagY + tagH / 2);
                } else {
                  ctx.fillStyle = "#26262D";
                  ctx.fill();
                  ctx.strokeStyle = "#383842";
                  ctx.lineWidth = 0.5;
                  ctx.stroke();
                  ctx.fillStyle = "#F2F2F3";
                  ctx.fillText(tagLabel, tagX + tagW / 2, tagY + tagH / 2);
                }
              } else {
                ctx.strokeStyle = "#26262D";
                ctx.lineWidth = 1;
                ctx.setLineDash([]);
                ctx.stroke();
              }

              // User Star Rating Badge on poster
              if (typeof node.myRating === "number" && node.myRating > 0) {
                const rBadgeW = 14;
                const rBadgeH = 8;
                const rBadgeX = x + 1;
                const rBadgeY = y + POSTER_HEIGHT - rBadgeH - 1;
                drawRoundedRect(ctx, rBadgeX, rBadgeY, rBadgeW, rBadgeH, 1.5);
                ctx.fillStyle = "#0F0F12";
                ctx.fill();
                ctx.fillStyle = "#F59E0B";
                ctx.font = "bold 4.5px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(`★${node.myRating.toFixed(1)}`, rBadgeX + rBadgeW / 2, rBadgeY + rBadgeH / 2);
              }

              // Highlighted person ring
              if (highlightedPerson) {
                const isMatch =
                  node.director === highlightedPerson ||
                  (node.cast || []).includes(highlightedPerson);
                if (isMatch) {
                  ctx.strokeStyle = "#F59E0B";
                  ctx.lineWidth = 2.5;
                  ctx.setLineDash([]);
                  ctx.stroke();
                }
              }

              ctx.restore();
            }}
            nodePointerAreaPaint={(
              nodeItem: object,
              color: string,
              ctx: CanvasRenderingContext2D
            ) => {
              const node = nodeItem as MovieNode;
              const x = (node.x ?? 0) - POSTER_WIDTH / 2;
              const y = (node.y ?? 0) - POSTER_HEIGHT / 2;
              ctx.fillStyle = color;
              ctx.fillRect(x - 2, y - 2, POSTER_WIDTH + 4, POSTER_HEIGHT + 4);
            }}
            linkColor={(linkItem: object) => {
              const link = linkItem as MovieLink;
              if (link.type === "recommend") return "#FF5A4F";
              if (link.type === "bridge") return "#5E81F4";
              return "#383842";
            }}
            linkWidth={(linkItem: object) => {
              const link = linkItem as MovieLink;
              if (link.type === "bridge") return 2;
              if (link.type === "recommend") return 1.5;
              return 1.2;
            }}
            linkLineDash={(linkItem: object) => {
              const link = linkItem as MovieLink;
              return link.type === "recommend" ? [4, 4] : null;
            }}
          />
        )}
      </div>
    )}

      {/* Dynamic Legend */}
      {watchedNodes.length > 0 && (
        <div className="absolute bottom-6 left-6 z-30 p-3 rounded-xl bg-[#17171C]/95 border border-[#26262D] backdrop-blur shadow-card flex flex-col gap-2 text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8B8B95]">
            {viewMode === "metro" ? "Metro Legend" : "Network Legend"}
          </span>
          {viewMode === "metro" ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-4 h-[4px] rounded-full bg-[#E15759]" />
                <span className="text-[#F2F2F3]">Line = Group ({connectionMode})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-white border-2 border-[#4E79A7] flex items-center justify-center" />
                <span className="text-[#F2F2F3]">Interchange (Movie in 2 groups)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-sm border-2 border-dashed border-[#FF5A4F] bg-[#17171C]" />
                <span className="text-[#F2F2F3]">Recommended Movie (Dashed)</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm border border-[#26262D] bg-[#17171C]" />
                <span className="text-[#F2F2F3]">Watched Movie</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm border-2 border-dashed border-[#FF5A4F] bg-[#17171C]" />
                <span className="text-[#F2F2F3]">Recommended (R)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-[2px] bg-[#383842]" />
                <span className="text-[#F2F2F3] capitalize">{connectionMode} Link</span>
              </div>
              {connectionMode === "genre" && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-[2px] bg-[#5E81F4]" />
                  <span className="text-[#F2F2F3]">Bridge Link (2nd genre)</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Confirm Add Movie Popover Modal ("When did you watch it?") */}
      <AnimatePresence>
        {pendingAddDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-sm rounded-2xl bg-[#17171C] border border-[#26262D] p-5 shadow-2xl space-y-4 text-[#F2F2F3]"
            >
              {/* Header with Movie Thumbnail */}
              <div className="flex items-start gap-3.5">
                <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden bg-[#0F0F12] border border-[#26262D] flex-shrink-0">
                  {pendingAddDetails.poster_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://image.tmdb.org/t/p/w185${pendingAddDetails.poster_path}`}
                      alt={pendingAddDetails.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#8B8B95]">
                      <Film className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-[#F2F2F3] truncate">
                    {pendingAddDetails.title}
                  </h3>
                  <p className="text-xs text-[#8B8B95] font-mono mt-0.5">
                    {pendingAddDetails.release_year || "Unknown year"}
                  </p>
                </div>
              </div>

              {/* Question */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8B8B95]">
                  When did you watch it?
                </label>

                {!isNotSureDate ? (
                  <input
                    type="date"
                    value={pendingWatchedDate}
                    onChange={(e) => {
                      setPendingWatchedDate(e.target.value);
                      setIsNotSureDate(false);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs font-mono text-[#F2F2F3] focus:border-[#FF5A4F] focus:outline-none transition-colors"
                  />
                ) : (
                  <div className="p-2.5 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs font-mono text-[#F2F2F3] flex items-center justify-between">
                    <span>Year: {pendingWatchedDate} (Release year)</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNotSureDate(false);
                        setPendingWatchedDate(new Date().toISOString().split("T")[0]);
                      }}
                      className="text-[11px] text-[#FF5A4F] hover:underline"
                    >
                      Change date
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleNotSureClick}
                    className={`text-xs transition-colors ${
                      isNotSureDate
                        ? "text-[#FF5A4F] font-semibold"
                        : "text-[#8B8B95] hover:text-[#F2F2F3] underline underline-offset-2"
                    }`}
                  >
                    Not sure (use release year {pendingAddDetails.release_year || ""})
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#26262D]">
                <button
                  type="button"
                  onClick={() => setPendingAddDetails(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8B8B95] hover:text-[#F2F2F3] bg-[#0F0F12] hover:bg-[#26262D] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddMovie}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors shadow-subtle"
                >
                  Add to map
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Modal */}
      <AnimatePresence>
        {showShareModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="w-full max-w-lg bg-[#17171C] border border-[#26262D] rounded-2xl p-6 shadow-2xl relative overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {!profile?.username ? (
                <div className="text-center py-4 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#FF5A4F]/10 text-[#FF5A4F] flex items-center justify-center mb-4 border border-[#FF5A4F]/20">
                    <Share2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-[#F2F2F3] mb-2">
                    Pick a username to share your map
                  </h3>
                  <p className="text-xs text-[#8B8B95] max-w-sm mb-6 leading-relaxed">
                    To generate your public profile link and custom OpenGraph share card, please set a username in your profile settings.
                  </p>
                  <div className="flex items-center gap-3 w-full justify-center">
                    <button
                      type="button"
                      onClick={() => setShowShareModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8B8B95] hover:text-[#F2F2F3] bg-[#0F0F12] hover:bg-[#26262D] transition-colors"
                    >
                      Maybe later
                    </button>
                    <Link
                      href="/settings?welcome=true"
                      onClick={() => setShowShareModal(false)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors shadow-subtle"
                    >
                      Go to Settings
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-bold text-[#F2F2F3]">
                      Share your movie map
                    </h3>
                    <p className="text-xs text-[#8B8B95] mt-1">
                      Share your interactive metro map and preview card with friends.
                    </p>
                  </div>

                  {/* OG Image Preview */}
                  <div className="relative rounded-xl overflow-hidden border border-[#26262D] bg-[#0F0F12] aspect-[1200/630] shadow-md group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/u/${profile.username}/opengraph-image`}
                      alt="Share Card Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Profile URL & Copy Link */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[#8B8B95] uppercase tracking-wider">
                      Public Profile Link
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={
                          typeof window !== "undefined"
                            ? `${window.location.origin}/u/${profile.username}`
                            : `/u/${profile.username}`
                        }
                        className="flex-1 bg-[#0F0F12] border border-[#26262D] rounded-xl px-3 py-2 text-xs text-[#F2F2F3] font-mono select-all focus:outline-none focus:border-[#FF5A4F]"
                      />
                      <button
                        type="button"
                        onClick={handleCopyShareLink}
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

                  {/* Modal Bottom Actions */}
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#26262D]">
                    <Link
                      href={`/u/${profile.username}`}
                      target="_blank"
                      className="inline-flex items-center gap-1.5 text-xs text-[#8B8B95] hover:text-[#F2F2F3] transition-colors"
                    >
                      <span>View profile</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>

                    <button
                      type="button"
                      onClick={handleDownloadShareCard}
                      disabled={isDownloadingCard}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors shadow-subtle disabled:opacity-50"
                    >
                      {isDownloadingCard ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Download card</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Score Breakdown & Badges Modal */}
      <ScorePanel
        score={cinemaScore}
        isOpen={showScorePanel}
        onClose={() => setShowScorePanel(false)}
      />

      {/* Large Slide-Over Movie Detail Panel (560px wide, full height, scrollable) */}
      <AnimatePresence>
        {selectedNode && (
          <MovieDetailPanel
            movieNode={selectedNode}
            allMapNodes={graph.nodes}
            onClose={() => setSelectedNode(null)}
            onRemoveMovie={handleRemoveMovie}
            onMarkAsWatched={handleMarkAsWatched}
            onDismissRecommendation={handleDismissRecommendation}
            onAddMovieById={handleAddMovieById}
            onUpdateRatingAndNote={handleUpdateRatingAndNote}
            onUpdateWatchedOn={handleUpdateWatchedOn}
            onSelectConnectedMovie={(node) => setSelectedNode(node)}
            onHighlightPerson={(person) => setHighlightedPerson(person)}
            activeHighlightedPerson={highlightedPerson}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
