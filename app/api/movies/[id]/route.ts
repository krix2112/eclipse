import { NextRequest, NextResponse } from "next/server";
import { getMovieDetails, type MovieDetails } from "@/lib/tmdb";
import { getOmdbDetails } from "@/lib/omdb";

interface MovieCacheEntry {
  timestamp: number;
  data: MovieDetails;
}

// 1-hour in-memory cache keyed by movie ID
const ONE_HOUR_MS = 60 * 60 * 1000;
const movieDetailsCache = new Map<string, MovieCacheEntry>();

/**
 * GET /api/movies/[id]
 * Retrieves comprehensive details for a movie from TMDB (credits, keywords, videos,
 * external_ids, watch/providers, similar) and OMDb (ratings, Rotten Tomatoes,
 * Metacritic, awards, age certification).
 * Cached in memory for 1 hour.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const movieId = params.id?.trim();

    if (!movieId) {
      return NextResponse.json(
        { error: "Movie ID parameter is required" },
        { status: 400 }
      );
    }

    // 1. Check in-memory 1-hour cache
    const cached = movieDetailsCache.get(movieId);
    if (cached && Date.now() - cached.timestamp < ONE_HOUR_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    // 2. Fetch TMDB extended details
    const movie = await getMovieDetails(movieId);

    // 3. Fetch OMDb data if imdb_id exists
    let omdbData = null;
    if (movie.imdb_id) {
      omdbData = await getOmdbDetails(movie.imdb_id);
    }

    movie.omdb = omdbData;

    // 4. Save to cache
    movieDetailsCache.set(movieId, {
      timestamp: Date.now(),
      data: movie,
    });

    return NextResponse.json(movie, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch movie details";

    const isMissingKey = message.includes("TMDB_API_KEY is not configured");

    return NextResponse.json(
      {
        error: message,
        isMissingKey,
      },
      { status: isMissingKey ? 503 : 500 }
    );
  }
}
