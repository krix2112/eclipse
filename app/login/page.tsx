"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Mail,
  Lock,
  User,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name.trim() || email.split("@")[0],
            },
          },
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        if (data.session) {
          // Check if profile has a username; if not, redirect to settings
          const { data: prof } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", data.session.user.id)
            .maybeSingle();

          if (!prof?.username) {
            setSuccessMsg("Account created! Redirecting to choose your username...");
            setTimeout(() => router.push("/settings?welcome=true"), 900);
          } else {
            setSuccessMsg("Account created! Redirecting to your map...");
            setTimeout(() => router.push("/graph"), 900);
          }
        } else {
          setSuccessMsg(
            "Account created! Please check your email to confirm your account, then sign in."
          );
        }
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setErrorMsg(error.message);
          return;
        }

        // Check if user has username configured
        if (signInData.user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", signInData.user.id)
            .maybeSingle();

          if (!prof?.username) {
            setSuccessMsg("Welcome back! Redirecting to complete your profile...");
            setTimeout(() => router.push("/settings?welcome=true"), 700);
            return;
          }
        }

        setSuccessMsg("Welcome back! Redirecting...");
        setTimeout(() => router.push("/graph"), 700);
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "An unexpected authentication error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/graph` : undefined,
        },
      });

      if (error) {
        if (
          error.message.toLowerCase().includes("not enabled") ||
          error.message.toLowerCase().includes("provider")
        ) {
          setErrorMsg(
            "Google sign-in is not configured yet on this Supabase project. Please sign in with email and password."
          );
        } else {
          setErrorMsg(error.message);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to initiate Google authentication."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-[#0F0F12]">
      {/* Auth Card Container */}
      <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-[#17171C] border border-[#26262D] shadow-card">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4 group">
            <span className="w-3 h-3 rounded-full bg-[#FF5A4F]" />
            <span className="font-semibold text-lg text-[#F2F2F3]">Eclipse</span>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-[#F2F2F3] tracking-tight">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-xs sm:text-sm text-[#8B8B95] mt-1">
            {isSignUp
              ? "Sign up to save your movie universe to the cloud"
              : "Sign in to access and sync your movie map"}
          </p>
        </div>

        {/* Feedback Alert Banners */}
        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">{successMsg}</p>
          </div>
        )}

        {/* Google Sign-in Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm text-[#F2F2F3] bg-[#0F0F12] hover:bg-[#26262D] border border-[#26262D] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#26262D]" />
          </div>
          <span className="relative px-3 bg-[#17171C] text-[11px] uppercase tracking-wider text-[#8B8B95] font-medium">
            Or with email
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label
                htmlFor="display-name"
                className="block text-xs font-medium text-[#8B8B95] mb-1.5"
              >
                Display Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B95]" />
                <input
                  id="display-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full bg-[#0F0F12] text-sm text-[#F2F2F3] placeholder-[#8B8B95]/50 rounded-xl pl-9 pr-3.5 py-2.5 border border-[#26262D] focus:border-[#FF5A4F] focus:ring-1 focus:ring-[#FF5A4F] transition-all outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="email-address"
              className="block text-xs font-medium text-[#8B8B95] mb-1.5"
            >
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B95]" />
              <input
                id="email-address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-[#0F0F12] text-sm text-[#F2F2F3] placeholder-[#8B8B95]/50 rounded-xl pl-9 pr-3.5 py-2.5 border border-[#26262D] focus:border-[#FF5A4F] focus:ring-1 focus:ring-[#FF5A4F] transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password-input"
              className="block text-xs font-medium text-[#8B8B95] mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B8B95]" />
              <input
                id="password-input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#0F0F12] text-sm text-[#F2F2F3] placeholder-[#8B8B95]/50 rounded-xl pl-9 pr-3.5 py-2.5 border border-[#26262D] focus:border-[#FF5A4F] focus:ring-1 focus:ring-[#FF5A4F] transition-all outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm text-white bg-[#FF5A4F] hover:bg-[#E84E44] transition-all transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>{isSignUp ? "Create Account" : "Sign In"}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className="text-xs text-[#8B8B95] hover:text-[#F2F2F3] transition-colors"
          >
            {isSignUp ? (
              <span>
                Already have an account?{" "}
                <strong className="text-[#FF5A4F] underline underline-offset-4">
                  Sign In
                </strong>
              </span>
            ) : (
              <span>
                Don&apos;t have an account?{" "}
                <strong className="text-[#FF5A4F] underline underline-offset-4">
                  Sign Up
                </strong>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
