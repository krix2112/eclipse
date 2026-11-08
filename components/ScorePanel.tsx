"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Trophy,
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
  Lock,
  CheckCircle2,
} from "lucide-react";
import type { CinemaScoreResult, BadgeInfo } from "@/lib/score";

interface ScorePanelProps {
  score: CinemaScoreResult;
  isOpen: boolean;
  onClose: () => void;
}

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

export default function ScorePanel({
  score,
  isOpen,
  onClose,
}: ScorePanelProps) {
  if (!isOpen) return null;

  const earnedCount = score.badges.filter((b) => b.earned).length;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl max-h-[90vh] bg-[#17171C] border border-[#26262D] rounded-2xl shadow-2xl flex flex-col overflow-hidden text-[#F2F2F3]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-[#26262D] bg-[#17171C]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF5A4F]/10 border border-[#FF5A4F]/20 flex items-center justify-center text-[#FF5A4F]">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-[#F2F2F3]">Cinema Score</h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FF5A4F]/15 text-[#FF5A4F] border border-[#FF5A4F]/30">
                    {score.level.name}
                  </span>
                </div>
                <p className="text-xs text-[#8B8B95] mt-0.5">
                  Derived from your taste exploration, diversity, and film habits
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {/* Level Banner & Progress */}
            <div className="p-4 sm:p-5 rounded-xl bg-[#0F0F12] border border-[#26262D] space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-3xl font-extrabold tracking-tight text-[#F2F2F3]">
                    {score.total}
                  </span>
                  <span className="text-xs text-[#8B8B95] ml-1.5 font-medium">
                    total points
                  </span>
                </div>
                {score.level.nextLevelName ? (
                  <div className="text-right">
                    <span className="text-xs font-semibold text-[#FF5A4F]">
                      {score.level.pointsToNext} pts to {score.level.nextLevelName}
                    </span>
                    <p className="text-[10px] text-[#8B8B95]">
                      {score.level.nextLevelPoints} pts required
                    </p>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-amber-400">
                    Max Rank Achieved
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-[#26262D] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#FF5A4F] to-[#FF7B72] h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${score.level.progressPercent}%` }}
                />
              </div>

              <div className="flex justify-between text-[11px] text-[#8B8B95] font-mono">
                <span>{score.level.name} ({score.level.minPoints} pts)</span>
                <span>
                  {score.level.nextLevelName
                    ? `${score.level.nextLevelName} (${score.level.nextLevelPoints} pts)`
                    : "Legend"}
                </span>
              </div>
            </div>

            {/* Badges Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B8B95]">
                  Badges
                </h3>
                <span className="text-xs font-medium text-[#8B8B95]">
                  {earnedCount} of {score.badges.length} unlocked
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {score.badges.map((badge: BadgeInfo) => {
                  const IconComponent = BADGE_ICONS[badge.iconName] || Award;
                  return (
                    <div
                      key={badge.id}
                      className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                        badge.earned
                          ? "bg-[#1C1C23] border-[#383844] shadow-sm"
                          : "bg-[#0F0F12]/60 border-[#26262D]/70 opacity-60"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          badge.earned
                            ? "bg-[#FF5A4F]/15 text-[#FF5A4F] border border-[#FF5A4F]/30"
                            : "bg-[#26262D] text-[#8B8B95]"
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-xs font-bold truncate ${
                              badge.earned ? "text-[#F2F2F3]" : "text-[#8B8B95]"
                            }`}
                          >
                            {badge.name}
                          </span>
                          {badge.earned ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Earned
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-mono text-[#8B8B95]">
                              <Lock className="w-2.5 h-2.5" />
                              {badge.progress}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#8B8B95] mt-0.5 leading-snug">
                          {badge.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Score Breakdown Section */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8B8B95]">
                Score Breakdown
              </h3>

              <div className="space-y-2">
                {score.breakdown.map((cat) => (
                  <div
                    key={cat.id}
                    className="p-3 rounded-xl bg-[#0F0F12] border border-[#26262D] flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="font-semibold text-[#F2F2F3]">
                        {cat.label}
                      </div>
                      <div className="text-[11px] text-[#8B8B95] mt-0.5 truncate">
                        {cat.detail}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="font-mono font-bold text-[#FF5A4F]">
                        +{cat.points}
                      </span>
                      {cat.maxPoints !== undefined && (
                        <span className="text-[10px] text-[#8B8B95] ml-1">
                          / {cat.maxPoints} max
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#26262D] bg-[#17171C] flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#26262D] hover:bg-[#383842] text-[#F2F2F3] transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

