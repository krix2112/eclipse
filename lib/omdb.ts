/**
 * OMDb API helper function
 *
 * Server-side helper to fetch IMDb rating, Rotten Tomatoes score,
 * Metacritic score, awards, and certification from OMDb by IMDb ID.
 * Key read from process.env.OMDB_API_KEY.
 *
 * If the key is missing or OMDb fails, handles gracefully by returning null.
 */

export interface OmdbMovieData {
  imdbRating?: string | null;
  imdbVotes?: string | null;
  rottenTomatoes?: string | null;
  metacritic?: string | null;
  awards?: string | null;
  rated?: string | null;
}

export async function getOmdbDetails(
  imdbId: string | null | undefined
): Promise<OmdbMovieData | null> {
  const apiKey = process.env.OMDB_API_KEY?.trim();
  if (!apiKey || !imdbId) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(
      apiKey
    )}&i=${encodeURIComponent(imdbId)}`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (!data || data.Response === "False") {
      return null;
    }

    let rottenTomatoes: string | null = null;
    let metacritic: string | null = null;

    if (Array.isArray(data.Ratings)) {
      for (const r of data.Ratings) {
        if (r.Source === "Rotten Tomatoes") {
          rottenTomatoes = r.Value;
        } else if (r.Source === "Metacritic") {
          metacritic = r.Value?.split("/")?.[0] || r.Value;
        }
      }
    }

    if (!metacritic && data.Metascore && data.Metascore !== "N/A") {
      metacritic = data.Metascore;
    }

    return {
      imdbRating:
        data.imdbRating && data.imdbRating !== "N/A" ? data.imdbRating : null,
      imdbVotes:
        data.imdbVotes && data.imdbVotes !== "N/A" ? data.imdbVotes : null,
      rottenTomatoes,
      metacritic,
      awards: data.Awards && data.Awards !== "N/A" ? data.Awards : null,
      rated: data.Rated && data.Rated !== "N/A" ? data.Rated : null,
    };
  } catch (err: unknown) {
    console.warn(`[OMDb] Failed to fetch details for IMDb ID ${imdbId}:`, err);
    return null;
  }
}

