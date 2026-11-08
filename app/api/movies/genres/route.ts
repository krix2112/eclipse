import { NextResponse } from "next/server";
import { getGenres } from "@/lib/tmdb";

/**
 * GET /api/movies/genres
 * Returns list of official TMDB genres for search filtering.
 */
export async function GET() {
  try {
    const genres = await getGenres();
    return NextResponse.json({ genres });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load genres";
    return NextResponse.json({ error: message, genres: [] }, { status: 500 });
  }
}

