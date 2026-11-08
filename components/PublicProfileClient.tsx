"use client";

import React, { useState, useMemo } from "react";
import {
  Film,
  Star,
  Copy,
  Check,
  Trophy,
  Award,
  Sparkles,
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

interface PublicProfileClientProps {
  profile: {
    id: string;
    username: string;
    display_name: string;
    bio?: string | null;
  };
  movies: MovieNode[];
}

export default function PublicProfileClient({
  profile,
  movies,
}: PublicProfileClientProps) {
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("genre");
  const [selectedNode, setSelectedNode] = useState<MovieNode | null>(null);
  const [highlightedPerson, setHighlightedPerson] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  // Rebuild graph based on connectionMode
  const graph = useMemo(() => {
    return rebuildFullGraph(movies, [], connectionMode);
  }, [movies, connectionMode]);

  // Compute Stats
  const movieCount = movies.length;
  const score = useMemo(() => computeScore(movies), [movies]);

  const genreCount = useMemo(() => {
    return new Set(movies.flatMap((m) => m.genres.map((g) => g.name))).size;
  }, [movies]);

  const interchangesCount = useMemo(() => {
    return movies.filter((m) => m.genres && m.genres.length >= 2).length;
  }, [movies]);

  const avgRating = useMemo(() => {
    const rated = movies.filter(
      (m) => typeof m.myRating === "number" && m.myRating > 0
    );
    if (rated.length === 0) return null;
    const sum = rated.reduce((acc, m) => acc + (m.myRating || 0), 0);
    return (sum / rated.length).toFixed(1);
  }, [movies]);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href).then(() => {
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2000);
      });
    }
  };

  const avatarInitial = (profile.display_name || profile.username || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-[#0F0F12] text-[#F2F2F3] overflow-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {copiedToast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#17171C] border border-[#26262D] shadow-2xl text-xs sm:text-sm text-[#F2F2F3]"
          >
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-medium">Profile link copied to clipboard!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Header Bar */}
      <div className="w-full bg-[#17171C] border-b border-[#26262D] px-4 sm:px-6 lg:px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* User Bio and Avatar */}
          <div className="flex items-start gap-4 min-w-0">
            {/* Avatar Initial */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF5A4F] to-[#E84E44] flex items-center justify-center text-white font-bold text-2xl shadow-md flex-shrink-0">
              {avatarInitial}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-[#F2F2F3] truncate">
                  {profile.display_name}
                </h1>
                <span className="text-xs sm:text-sm font-mono text-[#8B8B95]">
                  @{profile.username}
                </span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[#FF5A4F]/10 border border-[#FF5A4F]/30 text-[#FF5A4F]">
                  Public Map
                </span>
              </div>

              {/* Cinema Score Level & Top Badges */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-[#FF5A4F]/10 border border-[#FF5A4F]/30 text-[#FF5A4F]">
                  <Trophy className="w-3 h-3" />
                  <span>{score.level.name} · {score.total} pts</span>
                </span>

                {score.topBadges.map((badge: BadgeInfo) => {
                  const IconComponent = BADGE_ICONS[badge.iconName] || Trophy;
                  return (
                    <span
                      key={badge.id}
                      title={`${badge.name}: ${badge.description}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#0F0F12] border border-[#26262D] text-[11px] font-medium text-[#F2F2F3]"
                    >
                      <IconComponent className="w-3 h-3 text-[#FF5A4F]" />
                      <span>{badge.name}</span>
                    </span>
                  );
                })}
              </div>

              {profile.bio && (
                <p className="text-xs sm:text-sm text-[#8B8B95] mt-1 line-clamp-2 max-w-xl leading-relaxed">
                  {profile.bio}
                </p>
              )}
            </div>
          </div>

          {/* Stats Badges & Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs">
              <div className="px-3 py-1 text-center">
                <span className="font-bold text-[#F2F2F3] block">{movieCount}</span>
                <span className="text-[10px] text-[#8B8B95] uppercase font-medium">
                  Movies
                </span>
              </div>
              <div className="w-[1px] h-6 bg-[#26262D]" />
              <div className="px-3 py-1 text-center">
                <span className="font-bold text-[#F2F2F3] block">{genreCount}</span>
                <span className="text-[10px] text-[#8B8B95] uppercase font-medium">
                  Genres
                </span>
              </div>
              <div className="w-[1px] h-6 bg-[#26262D]" />
              <div className="px-3 py-1 text-center">
                <span className="font-bold text-[#F2F2F3] block">
                  {interchangesCount}
                </span>
                <span className="text-[10px] text-[#8B8B95] uppercase font-medium">
                  Bridges
                </span>
              </div>
              {avgRating && (
                <>
                  <div className="w-[1px] h-6 bg-[#26262D]" />
                  <div className="px-3 py-1 text-center">
                    <span className="font-bold text-amber-400 flex items-center justify-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400" />
                      {avgRating}
                    </span>
                    <span className="text-[10px] text-[#8B8B95] uppercase font-medium">
                      Avg Rating
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Copy Link Button */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-[#F2F2F3] bg-[#26262D] hover:bg-[#383842] border border-[#26262D] transition-colors shadow-sm"
            >
              <Copy className="w-3.5 h-3.5 text-[#8B8B95]" />
              <span>Share link</span>
            </button>
          </div>
        </div>
      </div>

      {/* Regroup Mode Toolbar */}
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 bg-[#0F0F12] border-b border-[#26262D] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8B8B95]">
            Group lines by:
          </span>
          <div className="flex items-center p-0.5 rounded-xl bg-[#17171C] border border-[#26262D]">
            {(
              [
                { id: "genre", label: "Genre" },
                { id: "director", label: "Director" },
                { id: "decade", label: "Decade" },
                { id: "cast", label: "Cast" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setConnectionMode(m.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  connectionMode === m.id
                    ? "bg-[#26262D] text-[#F2F2F3] shadow-sm font-semibold"
                    : "text-[#8B8B95] hover:text-[#F2F2F3]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#8B8B95]">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Read-only map</span>
        </div>
      </div>

      {/* Main Interactive Map Canvas */}
      <div className="relative flex-1 w-full overflow-hidden">
        {movies.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-3">
            <Film className="w-12 h-12 text-[#26262D]" />
            <h3 className="text-base font-bold text-[#F2F2F3]">
              No movies added yet
            </h3>
            <p className="text-xs text-[#8B8B95] max-w-sm">
              @{profile.username} hasn&apos;t added any movies to their watched map yet.
            </p>
          </div>
        ) : (
          <MetroMap
            watchedNodes={graph.watchedNodes}
            recommendedNodes={[]}
            connectionMode={connectionMode}
            onSelectNode={(node) => setSelectedNode(node)}
            selectedNodeId={selectedNode?.id}
            highlightedPerson={highlightedPerson}
            readOnly={true}
          />
        )}
      </div>

      {/* Read-Only Movie Detail Panel */}
      <AnimatePresence>
        {selectedNode && (
          <MovieDetailPanel
            movieNode={selectedNode}
            allMapNodes={graph.nodes}
            onClose={() => setSelectedNode(null)}
            onSelectConnectedMovie={(node) => setSelectedNode(node)}
            onHighlightPerson={(person) => setHighlightedPerson(person)}
            activeHighlightedPerson={highlightedPerson}
            readOnly={true}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
