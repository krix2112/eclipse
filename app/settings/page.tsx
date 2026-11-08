"use client";

import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Check,
  X,
  Loader2,
  Globe,
  Lock,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";

function SettingsContent() {
  const searchParams = useSearchParams();
  const isWelcome = searchParams.get("welcome") === "true";

  const { user, profile, loading: authLoading, refreshProfile } = useUser();

  // Form states
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  // Validation & Live uniqueness check
  type UsernameStatus =
    | "idle"
    | "too_short"
    | "too_long"
    | "invalid_chars"
    | "current"
    | "checking"
    | "available"
    | "taken";

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize form from user and profile data
  useEffect(() => {
    if (profile) {
      setUsername(profile.username || "");
      setDisplayName(profile.display_name || user?.user_metadata?.display_name || "");
      setBio(profile.bio || "");
      setIsPublic(profile.is_public !== undefined ? profile.is_public : true);
      if (profile.username) {
        setUsernameStatus("current");
        setStatusMessage("Your current username");
      }
    } else if (user) {
      setDisplayName(
        user.user_metadata?.display_name ||
          user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          ""
      );
    }
  }, [profile, user]);

  // Live Uniqueness Check Debounced Handler
  const checkUsernameUniqueness = useCallback(
    async (candidate: string) => {
      const clean = candidate.trim().toLowerCase();

      // Check regex format: 3-20 chars, lowercase letters, numbers, underscores
      if (clean.length < 3) {
        setUsernameStatus("too_short");
        setStatusMessage("Username must be at least 3 characters");
        return;
      }
      if (clean.length > 20) {
        setUsernameStatus("too_long");
        setStatusMessage("Username cannot exceed 20 characters");
        return;
      }
      if (!/^[a-z0-9_]+$/.test(clean)) {
        setUsernameStatus("invalid_chars");
        setStatusMessage("Only lowercase letters, numbers, and underscores allowed");
        return;
      }

      // If matches current saved username
      if (profile?.username && clean === profile.username.toLowerCase()) {
        setUsernameStatus("current");
        setStatusMessage("Your current username");
        return;
      }

      // Query database for availability
      setUsernameStatus("checking");
      setStatusMessage("Checking availability...");

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", clean)
          .maybeSingle();

        if (error) {
          console.warn("Error checking username:", error);
          setUsernameStatus("available");
          setStatusMessage("Username format valid");
          return;
        }

        if (data && data.id !== user?.id) {
          setUsernameStatus("taken");
          setStatusMessage("This username is already taken");
        } else {
          setUsernameStatus("available");
          setStatusMessage("Username is available!");
        }
      } catch (err) {
        console.warn("Uniqueness check error:", err);
      }
    },
    [profile?.username, user?.id]
  );

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!val) {
      setUsernameStatus("idle");
      setStatusMessage("");
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      checkUsernameUniqueness(val);
    }, 350);
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const cleanUsername = username.trim().toLowerCase();

    // Final validation
    if (cleanUsername.length < 3 || cleanUsername.length > 20) {
      setSaveError("Username must be between 3 and 20 characters.");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      setSaveError("Username contains invalid characters.");
      return;
    }
    if (usernameStatus === "taken") {
      setSaveError("Please select an available username.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        username: cleanUsername,
        display_name: displayName.trim() || cleanUsername,
        bio: bio.trim(),
        is_public: isPublic,
      });

      if (error) {
        if (error.code === "23505" || error.message.includes("unique")) {
          setSaveError("This username is already taken. Please choose another.");
          setUsernameStatus("taken");
          return;
        }
        throw error;
      }

      await refreshProfile();
      setSaveSuccess(true);
      setUsernameStatus("current");
      setStatusMessage("Your current username");

      // Auto clear feedback after 3s
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      console.error("Failed to save settings:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to update profile settings."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyProfileLink = () => {
    if (!username) return;
    const url = `${window.location.origin}/u/${username}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Auth Guard
  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#0F0F12]">
        <div className="flex items-center gap-2.5 text-xs text-[#8B8B95]">
          <Loader2 className="w-4 h-4 animate-spin text-[#FF5A4F]" />
          <span>Loading settings...</span>
        </div>
      </div>
    );
  }

  if (!user && !authLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-[#0F0F12]">
        <div className="w-full max-w-md p-6 rounded-2xl bg-[#17171C] border border-[#26262D] text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#26262D] text-[#FF5A4F] mx-auto flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-bold text-[#F2F2F3]">Authentication Required</h2>
          <p className="text-xs text-[#8B8B95] leading-relaxed">
            Please sign in to manage your username, public profile, and map settings.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-colors"
          >
            Sign in to continue
          </Link>
        </div>
      </div>
    );
  }

  const isFormValid =
    username.length >= 3 &&
    username.length <= 20 &&
    (usernameStatus === "available" || usernameStatus === "current");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0F0F12] text-[#F2F2F3] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/graph"
            className="inline-flex items-center gap-1.5 text-xs text-[#8B8B95] hover:text-[#F2F2F3] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Map</span>
          </Link>

          {profile?.username && (
            <Link
              href={`/u/${profile.username}`}
              className="inline-flex items-center gap-1.5 text-xs text-[#FF5A4F] hover:underline font-medium"
            >
              <span>View Public Profile</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>

        {/* Welcome / Onboarding Callout Banner */}
        {isWelcome && (
          <div className="p-4 rounded-2xl bg-[#FF5A4F]/10 border border-[#FF5A4F]/30 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[#FF5A4F] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-[#F2F2F3]">
                Pick a username to get your public map link
              </h3>
              <p className="text-xs text-[#8B8B95] mt-1 leading-relaxed">
                Choose a unique handle to share your taste map with friends, generate your share card, and unlock your public profile page.
              </p>
            </div>
          </div>
        )}

        {/* Main Settings Card */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#17171C] border border-[#26262D] shadow-2xl space-y-6">
          <div>
            <h1 className="text-xl font-bold text-[#F2F2F3]">Profile & Map Settings</h1>
            <p className="text-xs text-[#8B8B95] mt-1">
              Configure your public identity and sharing preferences on Eclipse.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. Username Field with Live Uniqueness Check */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="block text-xs font-semibold uppercase tracking-wider text-[#8B8B95]"
              >
                Username
              </label>

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-[#8B8B95]">
                  @
                </span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={handleUsernameChange}
                  maxLength={20}
                  placeholder="yourname"
                  className={`w-full pl-8 pr-10 py-2.5 rounded-xl bg-[#0F0F12] border text-xs font-mono text-[#F2F2F3] placeholder-[#8B8B95]/40 focus:outline-none transition-colors ${
                    usernameStatus === "available"
                      ? "border-emerald-500/60 focus:border-emerald-500"
                      : usernameStatus === "taken" ||
                        usernameStatus === "invalid_chars" ||
                        usernameStatus === "too_short" ||
                        usernameStatus === "too_long"
                      ? "border-red-500/60 focus:border-red-500"
                      : "border-[#26262D] focus:border-[#FF5A4F]"
                  }`}
                  required
                />

                {/* Right Status Indicator */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && (
                    <Loader2 className="w-4 h-4 animate-spin text-[#8B8B95]" />
                  )}
                  {usernameStatus === "available" && (
                    <Check className="w-4 h-4 text-emerald-400" />
                  )}
                  {(usernameStatus === "taken" ||
                    usernameStatus === "invalid_chars" ||
                    usernameStatus === "too_short" ||
                    usernameStatus === "too_long") && (
                    <X className="w-4 h-4 text-red-400" />
                  )}
                  {usernameStatus === "current" && (
                    <Check className="w-4 h-4 text-[#8B8B95]" />
                  )}
                </div>
              </div>

              {/* Status Message */}
              <div className="flex items-center justify-between text-[11px]">
                <span
                  className={
                    usernameStatus === "available"
                      ? "text-emerald-400 font-medium"
                      : usernameStatus === "taken" ||
                        usernameStatus === "invalid_chars" ||
                        usernameStatus === "too_short" ||
                        usernameStatus === "too_long"
                      ? "text-red-400"
                      : "text-[#8B8B95]"
                  }
                >
                  {statusMessage ||
                    "3-20 characters, lowercase letters, numbers, and underscores only"}
                </span>
                <span className="text-[#8B8B95] font-mono">{username.length} / 20</span>
              </div>
            </div>

            {/* 2. Display Name */}
            <div className="space-y-2">
              <label
                htmlFor="displayName"
                className="block text-xs font-semibold uppercase tracking-wider text-[#8B8B95]"
              >
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                placeholder="Your Name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs text-[#F2F2F3] placeholder-[#8B8B95]/40 focus:border-[#FF5A4F] focus:outline-none transition-colors"
              />
            </div>

            {/* 3. Bio */}
            <div className="space-y-2">
              <label
                htmlFor="bio"
                className="block text-xs font-semibold uppercase tracking-wider text-[#8B8B95]"
              >
                Bio (max 160 chars)
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={160}
                rows={3}
                placeholder="Cinephile, sci-fi enthusiast, 70s cinema fanatic..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F0F12] border border-[#26262D] text-xs text-[#F2F2F3] placeholder-[#8B8B95]/40 focus:border-[#FF5A4F] focus:outline-none transition-colors resize-none"
              />
              <div className="flex justify-end text-[11px] text-[#8B8B95] font-mono">
                {bio.length} / 160
              </div>
            </div>

            {/* 4. Public Profile Toggle */}
            <div className="p-4 rounded-xl bg-[#0F0F12] border border-[#26262D] flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-xl border mt-0.5 ${
                    isPublic
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-[#17171C] border-[#26262D] text-[#8B8B95]"
                  }`}
                >
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#F2F2F3]">
                    Public Profile
                  </div>
                  <p className="text-[11px] text-[#8B8B95] leading-relaxed mt-0.5">
                    {isPublic
                      ? "Your watched movie map and taste stats are visible at your public link."
                      : "Your profile is private. Only you can view your map."}
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                onClick={() => setIsPublic(!isPublic)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isPublic ? "bg-[#FF5A4F]" : "bg-[#26262D]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isPublic ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Live Link Preview if Public & Username set */}
            {isPublic && username && (
              <div className="p-3 rounded-xl bg-[#0F0F12] border border-[#26262D] flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 truncate text-[#8B8B95]">
                  <span className="font-mono text-[#F2F2F3] truncate">
                    /u/{username}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyProfileLink}
                  className="px-2.5 py-1 rounded-lg bg-[#17171C] hover:bg-[#26262D] border border-[#26262D] text-[#F2F2F3] flex items-center gap-1.5 transition-colors flex-shrink-0"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[11px] text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#8B8B95]" />
                      <span className="text-[11px]">Copy link</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Notifications */}
            {saveError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                {saveError}
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>Profile settings saved successfully!</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#26262D]">
              <button
                type="submit"
                disabled={isSaving || !isFormValid}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#FF5A4F] hover:bg-[#E84E44] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-subtle"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSaving ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#0F0F12] text-[#8B8B95]">
          <Loader2 className="w-6 h-6 text-[#FF5A4F] animate-spin" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
