/**
 * TMDB (The Movie Database) API helper functions
 *
 * Server-side helpers to communicate with the TMDB v3/v4 API.
 * Uses process.env.TMDB_API_KEY configured in .env.local.
 */

export const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export interface MovieSearchResult {
  id: number;
  title: string;
  release_year: string;
  poster_path: string | null;
  genre_ids: number[];
  overview: string;
  vote_average: number;
  popularity: number;
}

export interface MovieGenre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

export interface WatchProvidersByRegion {
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
  link?: string;
}

export interface SimilarMovie {
  id: number;
  title: string;
  release_year: string;
  poster_path: string | null;
  vote_average: number;
}

export interface MovieDetails {
  id: number;
  title: string;
  release_year: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  overview: string;
  tagline?: string;
  runtime?: number;
  runtimeFormatted?: string;
  genres: MovieGenre[];
  director: string;
  cast: string[];
  topCast?: CastMember[];
  keywords: string[];
  decade: string;
  vote_average?: number;
  imdb_id?: string | null;
  trailerYoutubeKey?: string | null;
  watchProviders?: WatchProvidersByRegion | null;
  watchRegion?: "IN" | "US" | null;
  similar?: SimilarMovie[];
  original_language?: string;
  // OMDb integration
  omdb?: {
    imdbRating?: string | null;
    imdbVotes?: string | null;
    rottenTomatoes?: string | null;
    metacritic?: string | null;
    awards?: string | null;
    rated?: string | null;
  } | null;
}

// In-memory cache for TMDB movie genres
let cachedGenres: MovieGenre[] | null = null;

/**
 * Internal helper to perform authenticated requests to the TMDB API.
 * Handles both TMDB v3 API keys and v4 Read Access Bearer tokens.
 */
async function tmdbFetch<T>(
  endpoint: string,
  params: Record<string, string> = {}
): Promise<T> {
  const apiKey = process.env.TMDB_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "TMDB_API_KEY is not configured. Please add TMDB_API_KEY to your .env.local file."
    );
  }

  const queryParams = new URLSearchParams(params);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (apiKey.startsWith("ey") || apiKey.length > 50) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else {
    queryParams.set("api_key", apiKey);
  }

  const queryString = queryParams.toString();
  const url = `${TMDB_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(url, {
    headers,
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      errorBody?.status_message ||
      `TMDB request failed with status ${response.status} (${response.statusText})`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

/**
 * Search movies by query string.
 * Calls /search/movie, sorts results by popularity, and returns normalized movie objects.
 */
export async function searchMovies(
  query: string,
  genreId?: number,
  yearFrom?: number,
  yearTo?: number
): Promise<MovieSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  interface TmdbSearchItem {
    id: number;
    title: string;
    release_date?: string;
    poster_path: string | null;
    genre_ids?: number[];
    overview?: string;
    vote_average?: number;
    popularity?: number;
  }

  interface TmdbSearchResponse {
    results: TmdbSearchItem[];
  }

  const data = await tmdbFetch<TmdbSearchResponse>("/search/movie", {
    query: trimmed,
    include_adult: "false",
    language: "en-US",
    page: "1",
  });

  const items = data.results || [];

  // Sort by popularity descending
  items.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  let mapped: MovieSearchResult[] = items.map((item) => {
    const release_year = item.release_date ? item.release_date.slice(0, 4) : "";
    return {
      id: item.id,
      title: item.title,
      release_year,
      poster_path: item.poster_path ?? null,
      genre_ids: item.genre_ids ?? [],
      overview: item.overview ?? "",
      vote_average: typeof item.vote_average === "number" ? Math.round(item.vote_average * 10) / 10 : 0,
      popularity: item.popularity ?? 0,
    };
  });

  // Filter by genre if provided
  if (genreId && genreId > 0) {
    mapped = mapped.filter((m) => m.genre_ids.includes(genreId));
  }

  // Filter by year range if provided
  if (yearFrom) {
    mapped = mapped.filter((m) => {
      const y = parseInt(m.release_year, 10);
      return !isNaN(y) && y >= yearFrom;
    });
  }
  if (yearTo) {
    mapped = mapped.filter((m) => {
      const y = parseInt(m.release_year, 10);
      return !isNaN(y) && y <= yearTo;
    });
  }

  return mapped;
}

function formatRuntime(minutes?: number): string {
  if (!minutes || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Fetch detailed movie information including credits, keywords, videos, external_ids,
 * watch providers, and similar movies.
 * Calls /movie/{id}?append_to_response=credits,keywords,videos,external_ids,watch/providers,similar
 */
export async function getMovieDetails(id: number | string): Promise<MovieDetails> {
  interface TmdbCastMember {
    id: number;
    name: string;
    character?: string;
    profile_path?: string | null;
    order?: number;
  }

  interface TmdbCrewMember {
    name: string;
    job: string;
  }

  interface TmdbCredits {
    cast?: TmdbCastMember[];
    crew?: TmdbCrewMember[];
  }

  interface TmdbKeywords {
    keywords?: Array<{ id: number; name: string }>;
  }

  interface TmdbVideo {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official?: boolean;
  }

  interface TmdbProviderItem {
    provider_id: number;
    provider_name: string;
    logo_path: string | null;
    display_priority?: number;
  }

  interface TmdbProviderRegionData {
    link?: string;
    flatrate?: TmdbProviderItem[];
    rent?: TmdbProviderItem[];
    buy?: TmdbProviderItem[];
  }

  interface TmdbSimilarItem {
    id: number;
    title: string;
    release_date?: string;
    poster_path: string | null;
    vote_average?: number;
  }

  interface TmdbDetailsResponse {
    id: number;
    title: string;
    release_date?: string;
    poster_path: string | null;
    backdrop_path?: string | null;
    overview?: string;
    tagline?: string;
    runtime?: number;
    original_language?: string;
    genres?: Array<{ id: number; name: string }>;
    vote_average?: number;
    credits?: TmdbCredits;
    keywords?: TmdbKeywords;
    videos?: { results?: TmdbVideo[] };
    external_ids?: { imdb_id?: string | null };
    "watch/providers"?: {
      results?: Record<string, TmdbProviderRegionData>;
    };
    similar?: { results?: TmdbSimilarItem[] };
  }

  const data = await tmdbFetch<TmdbDetailsResponse>(`/movie/${id}`, {
    language: "en-US",
    append_to_response:
      "credits,keywords,videos,external_ids,watch/providers,similar",
  });

  const release_year = data.release_date ? data.release_date.slice(0, 4) : "";
  const yearInt = parseInt(release_year, 10);
  const decade =
    !isNaN(yearInt) && yearInt > 1880
      ? `${Math.floor(yearInt / 10) * 10}s`
      : "Unknown era";

  // Director
  const directorCrew = data.credits?.crew?.find((c) => c.job === "Director");
  const director = directorCrew ? directorCrew.name : "Unknown Director";

  // Top 3 cast names
  const castList = (data.credits?.cast || [])
    .slice(0, 3)
    .map((c) => c.name);

  // Top 8 cast members with avatars
  const topCast: CastMember[] = (data.credits?.cast || [])
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character || "",
      profile_path: c.profile_path ?? null,
    }));

  // Keywords
  const keywordList = (data.keywords?.keywords || []).map((k) => k.name);

  // Best YouTube trailer
  let trailerYoutubeKey: string | null = null;
  const videoList = data.videos?.results || [];
  const officialTrailer = videoList.find(
    (v) => v.site === "YouTube" && v.type === "Trailer" && v.official
  );
  if (officialTrailer) {
    trailerYoutubeKey = officialTrailer.key;
  } else {
    const anyTrailer = videoList.find(
      (v) =>
        v.site === "YouTube" &&
        (v.type === "Trailer" || v.type === "Teaser")
    );
    if (anyTrailer) {
      trailerYoutubeKey = anyTrailer.key;
    }
  }

  // Watch providers (Region IN fallback to US)
  const wpResults = data["watch/providers"]?.results || {};
  let watchRegion: "IN" | "US" | null = null;
  let watchProviders: WatchProvidersByRegion | null = null;

  if (
    wpResults.IN &&
    (wpResults.IN.flatrate?.length ||
      wpResults.IN.rent?.length ||
      wpResults.IN.buy?.length)
  ) {
    watchRegion = "IN";
    watchProviders = {
      flatrate: (wpResults.IN.flatrate || []).map((p) => ({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path ?? null,
      })),
      rent: (wpResults.IN.rent || []).map((p) => ({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path ?? null,
      })),
      buy: (wpResults.IN.buy || []).map((p) => ({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path ?? null,
      })),
      link: wpResults.IN.link,
    };
  } else if (
    wpResults.US &&
    (wpResults.US.flatrate?.length ||
      wpResults.US.rent?.length ||
      wpResults.US.buy?.length)
  ) {
    watchRegion = "US";
    watchProviders = {
      flatrate: (wpResults.US.flatrate || []).map((p) => ({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path ?? null,
      })),
      rent: (wpResults.US.rent || []).map((p) => ({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path ?? null,
      })),
      buy: (wpResults.US.buy || []).map((p) => ({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path ?? null,
      })),
      link: wpResults.US.link,
    };
  }

  // Similar movies (top 6)
  const similar: SimilarMovie[] = (data.similar?.results || [])
    .slice(0, 6)
    .map((s) => ({
      id: s.id,
      title: s.title,
      release_year: s.release_date ? s.release_date.slice(0, 4) : "",
      poster_path: s.poster_path ?? null,
      vote_average:
        typeof s.vote_average === "number"
          ? Math.round(s.vote_average * 10) / 10
          : 0,
    }));

  return {
    id: data.id,
    title: data.title,
    release_year,
    poster_path: data.poster_path ?? null,
    backdrop_path: data.backdrop_path ?? null,
    overview: data.overview ?? "",
    tagline: data.tagline || "",
    runtime: data.runtime || 0,
    runtimeFormatted: formatRuntime(data.runtime),
    genres: (data.genres || []).map((g) => ({
      id: g.id,
      name: g.name,
    })),
    director,
    cast: castList,
    topCast,
    keywords: keywordList,
    decade,
    vote_average: data.vote_average,
    imdb_id: data.external_ids?.imdb_id || null,
    trailerYoutubeKey,
    watchProviders,
    watchRegion,
    similar,
    original_language: data.original_language || "en",
  };
}

/**
 * Fetch list of official TMDB movie genres and cache in memory.
 * Calls /genre/movie/list.
 */
export async function getGenres(): Promise<MovieGenre[]> {
  if (cachedGenres && cachedGenres.length > 0) {
    return cachedGenres;
  }

  interface TmdbGenresResponse {
    genres: Array<{ id: number; name: string }>;
  }

  const data = await tmdbFetch<TmdbGenresResponse>("/genre/movie/list", {
    language: "en-US",
  });

  cachedGenres = data.genres || [];
  return cachedGenres;
}
