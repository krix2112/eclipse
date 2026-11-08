"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2, Film, AlertCircle, X, Star, Filter } from "lucide-react";
import type { MovieSearchResult, MovieGenre } from "@/lib/tmdb";

export interface MovieSearchProps {
  onSelect: (movie: MovieSearchResult) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * MovieSearch Component
 * Features 300ms debounce, year range & genre filtering, popularity sorting,
 * rating badges, poster thumbnails, and a clean charcoal/coral design.
 */
export default function MovieSearch({
  onSelect,
  placeholder = "Search movies by title...",
  className = "",
  autoFocus = false,
}: MovieSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<MovieSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters state
  const [genres, setGenres] = useState<MovieGenre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>("");
  const [yearFrom, setYearFrom] = useState<string>("");
  const [yearTo, setYearTo] = useState<string>("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMissingKey, setIsMissingKey] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fetch genres on mount
  useEffect(() => {
    let isCurrent = true;
    fetch("/api/movies/genres")
      .then((res) => res.json())
      .then((data) => {
        if (isCurrent && Array.isArray(data.genres)) {
          setGenres(data.genres);
        }
      })
      .catch((e) => console.warn("Could not load genres:", e));
    return () => {
      isCurrent = false;
    };
  }, []);

  // Debounce input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Fetch movies when query or filters change
  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    if (!trimmed) {
      setResults([]);
      setErrorMessage(null);
      setIsMissingKey(false);
      setIsLoading(false);
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage(null);

    const performSearch = async () => {
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (selectedGenre) params.set("genre", selectedGenre);
        if (yearFrom) params.set("yearFrom", yearFrom);
        if (yearTo) params.set("yearTo", yearTo);

        const response = await fetch(`/api/movies/search?${params.toString()}`);
        const data = await response.json();

        if (!isCurrent) return;

        if (!response.ok || data.error) {
          setErrorMessage(data.error || "Unable to search movies.");
          setIsMissingKey(Boolean(data.isMissingKey));
          setResults([]);
        } else {
          setResults(data.results || []);
          setErrorMessage(null);
          setIsMissingKey(false);
        }
      } catch (err: unknown) {
        if (!isCurrent) return;
        const msg =
          err instanceof Error
            ? err.message
            : "Network error connecting to movie search API.";
        setErrorMessage(msg);
        setResults([]);
      } finally {
        if (isCurrent) {
          setIsLoading(false);
          setSelectedIndex(-1);
          setIsOpen(true);
        }
      }
    };

    performSearch();

    return () => {
      isCurrent = false;
    };
  }, [debouncedQuery, selectedGenre, yearFrom, yearTo]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("li");
      const activeItem = items[selectedIndex];
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  const handleSelectMovie = (movie: MovieSearchResult) => {
    onSelect(movie);
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (!isOpen && results.length > 0) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length === 0) return;
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelectMovie(results[selectedIndex]);
      }
    }
  };

  const clearQuery = () => {
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setErrorMessage(null);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const hasActiveFilters = Boolean(selectedGenre || yearFrom || yearTo);

  const clearFilters = () => {
    setSelectedGenre("");
    setYearFrom("");
    setYearTo("");
  };

  const showDropdown =
    isOpen && (query.trim().length > 0 || isLoading || errorMessage !== null);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Search Input Box */}
      <div className="relative flex items-center">
        <Search
          className={`absolute left-3 w-4 h-4 transition-colors pointer-events-none ${
            isLoading ? "text-[#FF5A4F]" : "text-[#8B8B95]"
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="w-full bg-[#17171C] text-sm text-[#F2F2F3] placeholder-[#8B8B95] rounded-xl pl-9 pr-16 py-2 border border-[#26262D] focus:border-[#FF5A4F] focus:ring-1 focus:ring-[#FF5A4F] transition-all outline-none"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search movies"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="movie-search-results"
          aria-autocomplete="list"
        />

        {/* Right buttons: Filter toggle & Loading / Clear */}
        <div className="absolute right-2 flex items-center gap-1">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-[#FF5A4F] animate-spin mr-1" />
          ) : query.length > 0 ? (
            <button
              type="button"
              onClick={clearQuery}
              className="p-1 text-[#8B8B95] hover:text-[#F2F2F3] rounded hover:bg-[#26262D] transition-colors"
              aria-label="Clear input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-lg border text-xs flex items-center transition-colors ${
              hasActiveFilters || showFilters
                ? "bg-[#FF5A4F]/10 text-[#FF5A4F] border-[#FF5A4F]/30"
                : "text-[#8B8B95] hover:text-[#F2F2F3] border-transparent hover:border-[#26262D]"
            }`}
            title="Filter by Genre or Year range"
            aria-label="Search filters"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Panel (Expandable) */}
      {showFilters && (
        <div className="mt-2 p-3 bg-[#17171C] border border-[#26262D] rounded-xl shadow-card text-xs space-y-2.5 z-40 relative">
          <div className="flex items-center justify-between text-[#8B8B95] font-medium text-[11px] uppercase tracking-wider">
            <span>Filter Results</span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[#FF5A4F] hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Genre Select */}
            <div>
              <label htmlFor="search-genre-select" className="block text-[11px] text-[#8B8B95] mb-1">
                Genre
              </label>
              <select
                id="search-genre-select"
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="w-full bg-[#0F0F12] border border-[#26262D] text-[#F2F2F3] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#FF5A4F]"
              >
                <option value="">All Genres</option>
                {genres.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Year From */}
            <div>
              <label htmlFor="search-year-from" className="block text-[11px] text-[#8B8B95] mb-1">
                Year From
              </label>
              <input
                id="search-year-from"
                type="number"
                placeholder="1980"
                min="1900"
                max="2030"
                value={yearFrom}
                onChange={(e) => setYearFrom(e.target.value)}
                className="w-full bg-[#0F0F12] border border-[#26262D] text-[#F2F2F3] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#FF5A4F]"
              />
            </div>

            {/* Year To */}
            <div>
              <label htmlFor="search-year-to" className="block text-[11px] text-[#8B8B95] mb-1">
                Year To
              </label>
              <input
                id="search-year-to"
                type="number"
                placeholder="2026"
                min="1900"
                max="2030"
                value={yearTo}
                onChange={(e) => setYearTo(e.target.value)}
                className="w-full bg-[#0F0F12] border border-[#26262D] text-[#F2F2F3] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-[#FF5A4F]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Dropdown Menu */}
      {showDropdown && (
        <div className="absolute left-0 right-0 mt-2 z-50 bg-[#17171C] border border-[#26262D] rounded-xl shadow-card overflow-hidden">
          {/* Missing TMDB Key or API Error Notification */}
          {errorMessage && (
            <div className="p-3.5 border-b border-[#26262D] bg-[#1F1F26]">
              <div className="flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 text-[#FF5A4F] flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-[#F2F2F3]">
                    {isMissingKey ? "TMDB API Key Required" : "Search Notice"}
                  </p>
                  <p className="text-[#8B8B95] leading-relaxed">{errorMessage}</p>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && results.length === 0 && (
            <div className="p-6 flex flex-col items-center justify-center gap-2 text-[#8B8B95] text-xs">
              <Loader2 className="w-5 h-5 text-[#FF5A4F] animate-spin" />
              <span>Searching movie catalog...</span>
            </div>
          )}

          {/* Empty Results State with Helpful Guidance */}
          {!isLoading && !errorMessage && results.length === 0 && debouncedQuery.trim() && (
            <div className="p-6 text-center text-[#8B8B95] text-xs space-y-1.5">
              <Film className="w-6 h-6 mx-auto mb-1 text-[#8B8B95]/60" />
              <p className="font-medium text-[#F2F2F3]">
                No movies found matching &ldquo;{debouncedQuery.trim()}&rdquo;
              </p>
              <p className="text-[11px] text-[#8B8B95]">
                {hasActiveFilters
                  ? "Try adjusting or clearing your genre and year filters."
                  : "Check the title spelling or try searching by standard English title."}
              </p>
            </div>
          )}

          {/* Results List */}
          {results.length > 0 && (
            <ul
              id="movie-search-results"
              ref={listRef}
              className="max-h-80 overflow-y-auto divide-y divide-[#26262D]"
              role="listbox"
            >
              {results.map((movie, index) => {
                const isSelected = index === selectedIndex;
                const posterUrl = movie.poster_path
                  ? `https://image.tmdb.org/t/p/w92${movie.poster_path}`
                  : null;

                return (
                  <li
                    key={movie.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectMovie(movie)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[#26262D] text-[#F2F2F3]"
                        : "hover:bg-[#1F1F26] text-[#F2F2F3]"
                    }`}
                  >
                    {/* Poster Thumbnail */}
                    <div className="w-9 h-13 flex-shrink-0 bg-[#0F0F12] rounded-md border border-[#26262D] overflow-hidden flex items-center justify-center">
                      {posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={posterUrl}
                          alt={movie.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Film className="w-4 h-4 text-[#8B8B95]" />
                      )}
                    </div>

                    {/* Movie Information */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate text-[#F2F2F3]">
                          {movie.title}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {movie.vote_average > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded bg-[#26262D] text-[#FF5A4F] font-medium">
                              <Star className="w-3 h-3 fill-[#FF5A4F] text-[#FF5A4F]" />
                              <span>{movie.vote_average}</span>
                            </span>
                          )}
                          {movie.release_year && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#26262D] text-[#8B8B95] font-mono">
                              {movie.release_year}
                            </span>
                          )}
                        </div>
                      </div>

                      {movie.overview && (
                        <p className="text-xs text-[#8B8B95] line-clamp-1 mt-0.5">
                          {movie.overview}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
