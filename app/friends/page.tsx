"use client";

import React, { useState, useEffect, Suspense, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  Inbox,
  Search,
  Check,
  X,
  Clock,
  Sparkles,
  MapPin,
  Trash2,
  Loader2,
  Film,
  ExternalLink,
  AlertCircle,
  Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import { useFriends, type SearchProfileResult, type FriendProfile } from "@/hooks/useFriends";
import LeaderboardTab from "@/components/LeaderboardTab";

function FriendsContent() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useUser();
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    incomingCount,
    loading: friendsLoading,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    searchProfiles,
  } = useFriends();

  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "find" | "leaderboard">("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchProfileResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [, startTransition] = useTransition();

  // Action states
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [unfriendConfirmModal, setUnfriendConfirmModal] = useState<FriendProfile | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // Auth Guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?redirect=/friends");
    }
  }, [authLoading, user, router]);

  // Debounced profile search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const res = await searchProfiles(searchQuery);
      startTransition(() => {
        setSearchResults(res);
        setIsSearching(false);
      });
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery, searchProfiles]);

  const handleAddFriend = async (targetUserId: string) => {
    setProcessingId(targetUserId);
    const res = await sendFriendRequest(targetUserId);
    setProcessingId(null);

    if (res.success) {
      showToast("Friend request sent!");
      // Update local search state
      setSearchResults((prev) =>
        prev.map((p) =>
          p.id === targetUserId
            ? { ...p, friendshipStatus: "pending_outgoing", friendshipId: res.friendshipId }
            : p
        )
      );
    } else {
      showToast(res.error || "Failed to send request");
    }
  };

  const handleAccept = async (friendshipId: string, name: string) => {
    setProcessingId(friendshipId);
    const res = await acceptRequest(friendshipId);
    setProcessingId(null);
    if (res.success) {
      showToast(`You and ${name} are now friends!`);
    } else {
      showToast(res.error || "Failed to accept request");
    }
  };

  const handleDecline = async (friendshipId: string) => {
    setProcessingId(friendshipId);
    const res = await declineRequest(friendshipId);
    setProcessingId(null);
    if (res.success) {
      showToast("Declined friend request");
    } else {
      showToast(res.error || "Failed to decline request");
    }
  };

  const handleCancel = async (friendshipId: string) => {
    setProcessingId(friendshipId);
    const res = await cancelRequest(friendshipId);
    setProcessingId(null);
    if (res.success) {
      showToast("Cancelled friend request");
    } else {
      showToast(res.error || "Failed to cancel request");
    }
  };

  const handleConfirmUnfriend = async () => {
    if (!unfriendConfirmModal) return;
    setProcessingId(unfriendConfirmModal.friendshipId);
    const res = await removeFriend(unfriendConfirmModal.friendshipId);
    setProcessingId(null);
    setUnfriendConfirmModal(null);
    if (res.success) {
      showToast(`Removed @${unfriendConfirmModal.username} from friends`);
    } else {
      showToast(res.error || "Failed to remove friend");
    }
  };

  if (authLoading || (!user && authLoading)) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#0F0F12] text-[#8B8B95]">
        <Loader2 className="w-6 h-6 text-[#FF5A4F] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0F0F12] text-[#F2F2F3] px-4 py-8 sm:px-6 lg:px-8">
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

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#26262D]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F2F2F3] flex items-center gap-2.5">
              <span>Friends & Community</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#8B8B95] mt-1">
              Connect with fellow cinephiles, explore their movie maps, and blend your tastes.
            </p>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-2 bg-[#17171C] px-3.5 py-1.5 rounded-xl border border-[#26262D] text-xs">
            <span className="text-[#8B8B95]">Connections:</span>
            <span className="font-bold text-[#FF5A4F]">{friends.length}</span>
            <span className="text-[#8B8B95]/40">•</span>
            <span className="text-[#8B8B95]">Pending:</span>
            <span className="font-bold text-[#38BDF8]">{incomingRequests.length}</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-[#26262D] pb-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("friends")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "friends"
                ? "bg-[#FF5A4F] text-white shadow-subtle"
                : "bg-[#17171C] text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D]"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Friends</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === "friends" ? "bg-white/20 text-white" : "bg-[#26262D] text-[#8B8B95]"
              }`}
            >
              {friends.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all relative ${
              activeTab === "requests"
                ? "bg-[#FF5A4F] text-white shadow-subtle"
                : "bg-[#17171C] text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D]"
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Requests</span>
            {incomingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-white text-[#FF5A4F]">
                {incomingCount}
              </span>
            )}
            {incomingCount === 0 && outgoingRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#26262D] text-[#8B8B95]">
                {outgoingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("find")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "find"
                ? "bg-[#FF5A4F] text-white shadow-subtle"
                : "bg-[#17171C] text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D]"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Find people</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("leaderboard")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "leaderboard"
                ? "bg-[#FF5A4F] text-white shadow-subtle"
                : "bg-[#17171C] text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#26262D]"
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Leaderboard</span>
          </button>
        </div>

        {/* Tab 1: Friends List */}
        {activeTab === "friends" && (
          <div className="space-y-4">
            {friendsLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-[#8B8B95] gap-3">
                <Loader2 className="w-6 h-6 text-[#FF5A4F] animate-spin" />
                <span className="text-xs">Loading friends...</span>
              </div>
            ) : friends.length === 0 ? (
              <div className="bg-[#17171C] border border-[#26262D] rounded-2xl p-10 text-center flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-[#FF5A4F]/10 text-[#FF5A4F] flex items-center justify-center mb-3 border border-[#FF5A4F]/20">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-[#F2F2F3] mb-1">
                  No friends connected yet
                </h3>
                <p className="text-xs text-[#8B8B95] max-w-sm mb-6">
                  Add friends to explore each other&apos;s movie maps and blend your movie tastes into shared maps.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("find")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#FF5A4F] hover:bg-[#E84E44] text-white transition-all shadow-subtle"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Find people to add</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {friends.map((friend) => (
                  <div
                    key={friend.friendshipId}
                    className="bg-[#17171C] border border-[#26262D] rounded-2xl p-4 sm:p-5 flex flex-col justify-between hover:border-[#FF5A4F]/30 transition-all shadow-card group"
                  >
                    <div>
                      {/* Top row: Avatar + Name + Movie count */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-full bg-[#0F0F12] border-2 border-[#FF5A4F] flex items-center justify-center text-sm font-bold text-[#FF5A4F] flex-shrink-0">
                            {friend.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-[#F2F2F3] group-hover:text-[#FF5A4F] transition-colors line-clamp-1">
                                {friend.displayName}
                              </h3>
                              {!friend.isPublic && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#26262D] text-[#8B8B95] font-mono">
                                  Private
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-[#8B8B95]">
                              @{friend.username}
                            </span>
                          </div>
                        </div>

                        {/* Movie count tag */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0F0F12] border border-[#26262D] text-[11px] text-[#8B8B95]">
                          <Film className="w-3 h-3 text-[#FF5A4F]" />
                          <span>{friend.movieCount} movies</span>
                        </div>
                      </div>

                      {/* Bio */}
                      {friend.bio && (
                        <p className="text-xs text-[#8B8B95] mt-3 line-clamp-2 leading-relaxed">
                          {friend.bio}
                        </p>
                      )}
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center justify-between gap-2 mt-5 pt-3.5 border-t border-[#26262D]">
                      <div className="flex items-center gap-2">
                        {/* View Map */}
                        <Link
                          href={`/u/${friend.username}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#F2F2F3] bg-[#26262D] hover:bg-[#383842] transition-colors"
                        >
                          <MapPin className="w-3 h-3 text-[#38BDF8]" />
                          <span>View map</span>
                        </Link>

                        {/* Blend */}
                        <Link
                          href={`/blend/${friend.username}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors shadow-subtle"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Blend</span>
                        </Link>
                      </div>

                      {/* Unfriend button */}
                      <button
                        type="button"
                        onClick={() => setUnfriendConfirmModal(friend)}
                        className="p-1.5 rounded-lg text-[#8B8B95] hover:text-red-400 hover:bg-[#26262D] transition-colors"
                        title="Unfriend"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Requests (Incoming + Outgoing) */}
        {activeTab === "requests" && (
          <div className="space-y-6">
            {/* Incoming Requests */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#8B8B95]">
                  Incoming Requests
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF5A4F]/10 text-[#FF5A4F] border border-[#FF5A4F]/20">
                  {incomingRequests.length}
                </span>
              </div>

              {incomingRequests.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#17171C] border border-[#26262D] text-xs text-[#8B8B95] text-center">
                  No incoming friend requests right now.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.friendshipId}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#17171C] border border-[#26262D]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#0F0F12] border border-[#26262D] flex items-center justify-center text-sm font-bold text-[#FF5A4F] flex-shrink-0">
                          {req.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-[#F2F2F3]">
                            {req.displayName}
                          </h4>
                          <span className="text-[11px] text-[#8B8B95]">
                            @{req.username}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleAccept(req.friendshipId, req.displayName)}
                          disabled={processingId === req.friendshipId}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors shadow-subtle disabled:opacity-50"
                        >
                          {processingId === req.friendshipId ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecline(req.friendshipId)}
                          disabled={processingId === req.friendshipId}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#8B8B95] hover:text-[#F2F2F3] bg-[#0F0F12] hover:bg-[#26262D] border border-[#26262D] transition-colors disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing Requests */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#8B8B95]">
                  Outgoing Requests
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#26262D] text-[#8B8B95]">
                  {outgoingRequests.length}
                </span>
              </div>

              {outgoingRequests.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#17171C] border border-[#26262D] text-xs text-[#8B8B95] text-center">
                  No pending outgoing requests.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.friendshipId}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#17171C] border border-[#26262D]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#0F0F12] border border-[#26262D] flex items-center justify-center text-sm font-bold text-[#8B8B95] flex-shrink-0">
                          {req.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-[#F2F2F3]">
                            {req.displayName}
                          </h4>
                          <span className="text-[11px] text-[#8B8B95]">
                            @{req.username}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span className="text-[11px] text-[#8B8B95] flex items-center gap-1 mr-2">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Pending response</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCancel(req.friendshipId)}
                          disabled={processingId === req.friendshipId}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#8B8B95] hover:text-[#F2F2F3] bg-[#0F0F12] hover:bg-[#26262D] border border-[#26262D] transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Find people */}
        {activeTab === "find" && (
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#8B8B95] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search community by username..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#17171C] border border-[#26262D] text-xs sm:text-sm text-[#F2F2F3] placeholder-[#8B8B95] focus:outline-none focus:border-[#FF5A4F] transition-colors"
              />
              {isSearching && (
                <Loader2 className="w-4 h-4 text-[#FF5A4F] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
              )}
            </div>

            {/* Results List */}
            {searchQuery.trim() === "" ? (
              <div className="p-8 text-center bg-[#17171C] border border-[#26262D] rounded-2xl text-xs text-[#8B8B95]">
                Type a username above to find public movie map profiles and send friend requests.
              </div>
            ) : searchResults.length === 0 && !isSearching ? (
              <div className="p-8 text-center bg-[#17171C] border border-[#26262D] rounded-2xl text-xs text-[#8B8B95]">
                No public profiles found matching &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              <div className="space-y-2.5">
                {searchResults.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#17171C] border border-[#26262D] hover:border-[#26262D]/80 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#0F0F12] border border-[#26262D] flex items-center justify-center text-sm font-bold text-[#FF5A4F] flex-shrink-0">
                        {p.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-[#F2F2F3]">
                            {p.displayName}
                          </h4>
                          <Link
                            href={`/u/${p.username}`}
                            target="_blank"
                            className="text-[#8B8B95] hover:text-[#F2F2F3] transition-colors"
                            title="Preview profile"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                        <span className="text-[11px] text-[#8B8B95]">
                          @{p.username}
                        </span>
                      </div>
                    </div>

                    <div className="self-end sm:self-center">
                      {p.friendshipStatus === "friends" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-xs font-semibold">
                          <Check className="w-3.5 h-3.5" />
                          <span>Friends</span>
                        </span>
                      ) : p.friendshipStatus === "pending_outgoing" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#26262D] text-[#8B8B95] text-xs font-medium">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Requested</span>
                        </span>
                      ) : p.friendshipStatus === "pending_incoming" ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (p.friendshipId) handleAccept(p.friendshipId, p.displayName);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF5A4F] text-white text-xs font-semibold hover:bg-[#E84E44] transition-colors shadow-subtle"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept Request</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddFriend(p.id)}
                          disabled={processingId === p.id}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#26262D] hover:bg-[#383842] text-[#F2F2F3] text-xs font-semibold border border-[#383842] transition-colors shadow-sm disabled:opacity-50"
                        >
                          {processingId === p.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-[#FF5A4F]" />
                          ) : (
                            <UserPlus className="w-3.5 h-3.5 text-[#FF5A4F]" />
                          )}
                          <span>Add friend</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Leaderboard */}
        {activeTab === "leaderboard" && user && (
          <LeaderboardTab
            friends={friends}
            currentUserId={user.id}
            currentUserProfile={profile}
          />
        )}
      </div>

      {/* Unfriend Confirmation Modal */}
      <AnimatePresence>
        {unfriendConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="w-full max-w-sm bg-[#17171C] border border-[#26262D] rounded-2xl p-6 shadow-2xl relative"
            >
              <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center mb-3 border border-red-500/20">
                <AlertCircle className="w-5 h-5" />
              </div>

              <h3 className="text-base font-bold text-[#F2F2F3] mb-1">
                Remove friend?
              </h3>
              <p className="text-xs text-[#8B8B95] leading-relaxed mb-6">
                Are you sure you want to unfriend{" "}
                <span className="text-[#F2F2F3] font-semibold">
                  @{unfriendConfirmModal.username}
                </span>
                ? You will no longer be able to blend movie maps or view their private profile.
              </p>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setUnfriendConfirmModal(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#8B8B95] hover:text-[#F2F2F3] bg-[#0F0F12] hover:bg-[#26262D] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnfriend}
                  disabled={processingId === unfriendConfirmModal.friendshipId}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors shadow-subtle disabled:opacity-50"
                >
                  {processingId === unfriendConfirmModal.friendshipId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Remove friend"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FriendsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#0F0F12] text-[#8B8B95]">
          <Loader2 className="w-6 h-6 text-[#FF5A4F] animate-spin" />
        </div>
      }
    >
      <FriendsContent />
    </Suspense>
  );
}
