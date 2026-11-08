"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";

export interface FriendProfile {
  id: string;
  username: string;
  displayName: string;
  bio?: string | null;
  isPublic: boolean;
  movieCount: number;
  friendshipId: string;
  since?: string;
}

export interface FriendRequest {
  friendshipId: string;
  userId: string;
  username: string;
  displayName: string;
  bio?: string | null;
  createdAt: string;
}

export interface SearchProfileResult {
  id: string;
  username: string;
  displayName: string;
  bio?: string | null;
  friendshipStatus: "none" | "friends" | "pending_outgoing" | "pending_incoming";
  friendshipId?: string;
}

export function useFriends() {
  const { user } = useUser();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFriendships = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all friendships involving current user
      const { data: friendships, error: fsError } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (fsError) {
        throw fsError;
      }

      const rows = friendships || [];

      // Categorize
      const incomingRows = rows.filter(
        (r) => r.addressee_id === user.id && r.status === "pending"
      );
      const outgoingRows = rows.filter(
        (r) => r.requester_id === user.id && r.status === "pending"
      );
      const acceptedRows = rows.filter((r) => r.status === "accepted");

      // Collect all other user IDs needed to look up profiles
      const otherUserIds = new Set<string>();
      incomingRows.forEach((r) => otherUserIds.add(r.requester_id));
      outgoingRows.forEach((r) => otherUserIds.add(r.addressee_id));
      acceptedRows.forEach((r) => {
        otherUserIds.add(
          r.requester_id === user.id ? r.addressee_id : r.requester_id
        );
      });

      if (otherUserIds.size === 0) {
        setFriends([]);
        setIncomingRequests([]);
        setOutgoingRequests([]);
        setLoading(false);
        return;
      }

      const idList = Array.from(otherUserIds);

      // Fetch profiles in batch
      const { data: profileRows, error: profError } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, is_public")
        .in("id", idList);

      if (profError) throw profError;

      const profileMap = new Map<
        string,
        {
          id: string;
          username: string;
          display_name: string;
          bio?: string | null;
          is_public: boolean;
        }
      >();
      (profileRows || []).forEach((p) => {
        profileMap.set(p.id, p);
      });

      // Fetch movie counts for accepted friends
      const friendIds = acceptedRows.map((r) =>
        r.requester_id === user.id ? r.addressee_id : r.requester_id
      );

      const movieCountMap = new Map<string, number>();
      if (friendIds.length > 0) {
        const { data: movieRows } = await supabase
          .from("user_movies")
          .select("user_id")
          .in("user_id", friendIds)
          .eq("status", "watched");

        (movieRows || []).forEach((m) => {
          movieCountMap.set(m.user_id, (movieCountMap.get(m.user_id) || 0) + 1);
        });
      }

      // Build incoming requests
      const incoming: FriendRequest[] = [];
      incomingRows.forEach((r) => {
        const p = profileMap.get(r.requester_id);
        if (p) {
          incoming.push({
            friendshipId: r.id,
            userId: p.id,
            username: p.username || "user",
            displayName: p.display_name || p.username || "User",
            bio: p.bio,
            createdAt: r.created_at,
          });
        }
      });

      // Build outgoing requests
      const outgoing: FriendRequest[] = [];
      outgoingRows.forEach((r) => {
        const p = profileMap.get(r.addressee_id);
        if (p) {
          outgoing.push({
            friendshipId: r.id,
            userId: p.id,
            username: p.username || "user",
            displayName: p.display_name || p.username || "User",
            bio: p.bio,
            createdAt: r.created_at,
          });
        }
      });

      // Build accepted friends
      const friendList: FriendProfile[] = [];
      acceptedRows.forEach((r) => {
        const fid = r.requester_id === user.id ? r.addressee_id : r.requester_id;
        const p = profileMap.get(fid);
        if (p) {
          friendList.push({
            id: p.id,
            username: p.username || "user",
            displayName: p.display_name || p.username || "User",
            bio: p.bio,
            isPublic: p.is_public ?? true,
            movieCount: movieCountMap.get(fid) || 0,
            friendshipId: r.id,
            since: r.created_at,
          });
        }
      });

      setFriends(friendList);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (err: unknown) {
      console.error("[useFriends] Error fetching friendships:", err);
      setError("Failed to load friend connections");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFriendships();
  }, [fetchFriendships]);

  // Actions
  const sendFriendRequest = async (targetUserId: string) => {
    if (!user) return { success: false, error: "Please log in" };
    if (targetUserId === user.id) {
      return { success: false, error: "Cannot add yourself as a friend" };
    }

    try {
      const { data, error: insertError } = await supabase
        .from("friendships")
        .insert({
          requester_id: user.id,
          addressee_id: targetUserId,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          return { success: false, error: "Friend request already sent" };
        }
        throw insertError;
      }

      await fetchFriendships();
      return { success: true, friendshipId: data?.id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send request";
      return { success: false, error: msg };
    }
  };

  const acceptRequest = async (friendshipId: string) => {
    if (!user) return { success: false, error: "Please log in" };

    try {
      const { error: updateError } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", friendshipId)
        .eq("addressee_id", user.id);

      if (updateError) throw updateError;
      await fetchFriendships();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to accept request";
      return { success: false, error: msg };
    }
  };

  const declineRequest = async (friendshipId: string) => {
    if (!user) return { success: false, error: "Please log in" };

    try {
      const { error: deleteError } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId)
        .eq("addressee_id", user.id);

      if (deleteError) throw deleteError;
      await fetchFriendships();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to decline request";
      return { success: false, error: msg };
    }
  };

  const cancelRequest = async (friendshipId: string) => {
    if (!user) return { success: false, error: "Please log in" };

    try {
      const { error: deleteError } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId)
        .eq("requester_id", user.id);

      if (deleteError) throw deleteError;
      await fetchFriendships();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel request";
      return { success: false, error: msg };
    }
  };

  const removeFriend = async (friendshipId: string) => {
    if (!user) return { success: false, error: "Please log in" };

    try {
      const { error: deleteError } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendshipId)
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (deleteError) throw deleteError;
      await fetchFriendships();
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove friend";
      return { success: false, error: msg };
    }
  };

  // Search profiles (public only, not self) with status
  const searchProfiles = useCallback(
    async (query: string): Promise<SearchProfileResult[]> => {
      const clean = query.trim().toLowerCase();
      if (!clean) return [];

      try {
        const { data, error: sError } = await supabase
          .from("profiles")
          .select("id, username, display_name, bio, is_public")
          .eq("is_public", true)
          .ilike("username", `%${clean}%`)
          .limit(15);

        if (sError) throw sError;

        const results: SearchProfileResult[] = [];
        (data || []).forEach((p) => {
          if (user && p.id === user.id) return; // Prevent self

          let friendshipStatus: SearchProfileResult["friendshipStatus"] = "none";
          let friendshipId: string | undefined = undefined;

          // Check if already friends
          const friend = friends.find((f) => f.id === p.id);
          if (friend) {
            friendshipStatus = "friends";
            friendshipId = friend.friendshipId;
          } else {
            // Check outgoing
            const out = outgoingRequests.find((r) => r.userId === p.id);
            if (out) {
              friendshipStatus = "pending_outgoing";
              friendshipId = out.friendshipId;
            } else {
              // Check incoming
              const inc = incomingRequests.find((r) => r.userId === p.id);
              if (inc) {
                friendshipStatus = "pending_incoming";
                friendshipId = inc.friendshipId;
              }
            }
          }

          results.push({
            id: p.id,
            username: p.username,
            displayName: p.display_name || p.username,
            bio: p.bio,
            friendshipStatus,
            friendshipId,
          });
        });

        return results;
      } catch (err) {
        console.error("Search profiles error:", err);
        return [];
      }
    },
    [user, friends, outgoingRequests, incomingRequests]
  );

  const incomingCount = useMemo(() => incomingRequests.length, [incomingRequests]);

  return {
    friends,
    incomingRequests,
    outgoingRequests,
    incomingCount,
    loading,
    error,
    refreshFriends: fetchFriendships,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    searchProfiles,
  };
}

