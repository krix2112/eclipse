"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogIn,
  LogOut,
  User,
  Settings,
  Globe,
  ChevronDown,
} from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useFriends } from "@/hooks/useFriends";

/**
 * Clean Navbar
 * Neutral charcoal theme with logo, My Map, user menu with Profile, Settings, and Sign out.
 */
export default function Navbar() {
  const pathname = usePathname();
  const { user, profile, displayName, loading, signOut } = useUser();
  const { incomingCount } = useFriends();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0F0F12]/95 backdrop-blur-md border-b border-[#26262D]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo and Main Nav */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-[#F2F2F3] hover:opacity-90 transition-opacity"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5A4F]" />
            <span className="font-semibold tracking-tight">Eclipse</span>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/graph"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === "/graph"
                  ? "text-[#F2F2F3] bg-[#17171C] border border-[#26262D]"
                  : "text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#17171C]"
              }`}
            >
              My Map
            </Link>

            {/* Friends */}
            <Link
              href="/friends"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                pathname?.startsWith("/friends")
                  ? "text-[#F2F2F3] bg-[#17171C] border border-[#26262D]"
                  : "text-[#8B8B95] hover:text-[#F2F2F3] hover:bg-[#17171C]"
              }`}
            >
              <span>Friends</span>
              {user && incomingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#FF5A4F] text-white">
                  {incomingCount}
                </span>
              )}
            </Link>
          </nav>
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {!loading && (
            <div>
              {user ? (
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#17171C] hover:bg-[#26262D] border border-[#26262D] hover:border-[#FF5A4F]/40 text-xs text-[#F2F2F3] transition-all shadow-subtle group"
                    aria-expanded={menuOpen}
                    aria-label="User menu"
                  >
                    <div className="w-5 h-5 rounded-full bg-[#26262D] group-hover:bg-[#FF5A4F]/20 flex items-center justify-center text-[#FF5A4F] font-bold text-[10px] transition-colors">
                      <User className="w-3 h-3 text-[#FF5A4F]" />
                    </div>
                    <span className="font-medium max-w-[120px] truncate">
                      {displayName}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-[#8B8B95] transition-transform duration-150 ${
                        menuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* Dropdown Menu */}
                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#17171C] border border-[#26262D] p-1.5 shadow-2xl z-50 text-xs text-[#F2F2F3] animate-in fade-in zoom-in-95 duration-100">
                      {/* User Info Header */}
                      <div className="px-3 py-2 border-b border-[#26262D] mb-1">
                        <div className="font-semibold text-[#F2F2F3] truncate">
                          {displayName}
                        </div>
                        <div className="text-[11px] text-[#8B8B95] truncate font-mono">
                          {profile?.username ? `@${profile.username}` : user.email}
                        </div>
                      </div>

                      {/* View Public Profile (if username configured) */}
                      {profile?.username ? (
                        <Link
                          href={`/u/${profile.username}`}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5 text-[#FF5A4F]" />
                          <span>My Public Profile</span>
                        </Link>
                      ) : (
                        <Link
                          href="/settings?welcome=true"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#FF5A4F] hover:bg-[#26262D] transition-colors"
                        >
                          <Globe className="w-3.5 h-3.5 text-[#FF5A4F]" />
                          <span>Set public username</span>
                        </Link>
                      )}

                      {/* Settings */}
                      <Link
                        href="/settings"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#F2F2F3] hover:bg-[#26262D] transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#8B8B95]" />
                        <span>Settings</span>
                      </Link>

                      {/* Divider */}
                      <div className="my-1 border-t border-[#26262D]" />

                      {/* Sign Out */}
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          signOut();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors text-left"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#F2F2F3] bg-[#17171C] hover:bg-[#26262D] border border-[#26262D] hover:border-[#FF5A4F]/40 transition-colors shadow-subtle"
                >
                  <LogIn className="w-3.5 h-3.5 text-[#FF5A4F]" />
                  <span>Sign in</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
