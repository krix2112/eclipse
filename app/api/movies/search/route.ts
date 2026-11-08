import { NextRequest, NextResponse } from "next/server";
import { searchMovies } from "@/lib/tmdb";

/**
 * GET /api/movies/search?q={query}&genre={genreId}&yearFrom={from}&yearTo={to}
 * Searches TMDB for movies with optional genre and release year filtering.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";
    const genreParam = searchParams.get("genre");
    const yearFromParam = searchParams.get("yearFrom");
    const yearToParam = searchParams.get("yearTo");

    if (!query.trim()) {
      return NextResponse.json({ results: [] }, { status: 200 });
    }

    const genreId = genreParam ? parseInt(genreParam, 10) : undefined;
    const yearFrom = yearFromParam ? parseInt(yearFromParam, 10) : undefined;
    const yearTo = yearToParam ? parseInt(yearToParam, 10) : undefined;

    const results = await searchMovies(query, genreId, yearFrom, yearTo);
    return NextResponse.json({ results }, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to search movies from TMDB";

    const isMissingKey = message.includes("TMDB_API_KEY is not configured");

    return NextResponse.json(
      {
        error: message,
        isMissingKey,
        results: [],
      },
      { status: isMissingKey ? 503 : 500 }
    );
  }
}
