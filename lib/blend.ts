/**
 * Movie Blend Computation & Matching Engine
 *
 * Implements pure matching math:
 * - 50% Jaccard similarity of movie IDs
 * - 30% Cosine similarity of genre-count vectors
 * - 20% Rating agreement on shared movies (1 - avg abs difference / 5; 0.5 fallback if no shared rated movies)
 *
 * Caches blend computations in-memory for 5 minutes per pair.
 */

export interface BlendMovie {
  id: string | number;
  tmdbId?: number;
  title: string;
  year?: string;
  posterPath?: string | null;
  genres: Array<{ id: number; name: string }>;
  status?: string;
  watchedOn?: string;
  myRating?: number | null;
  decade?: string;
  director?: string;
  cast?: string[];
  overview?: string;
  theirRating?: number | null; // For display when friend rated the movie
}

export interface BlendResult {
  matchScore: number; // 0 - 100
  matchLabel: string; // "Different universes" | "Some overlap" | "Great taste match" | "Movie soulmates"
  jaccardScore: number; // 0 - 1
  genreCosineScore: number; // 0 - 1
  ratingAgreementScore: number; // 0 - 1
  sharedMovies: BlendMovie[];
  onlyMine: BlendMovie[];
  onlyTheirs: BlendMovie[];
  genreAffinity: Array<{ genre: string; weight: number }>;
}

/**
 * Pure, unit-testable blend math function.
 * Computes overlap and similarity scores between two watched movie collections.
 */
export function calculateMatchScore(
  myMovies: BlendMovie[],
  theirMovies: BlendMovie[]
): BlendResult {
  const getMovieKey = (m: BlendMovie) => String(m.tmdbId ?? m.id);

  const myMap = new Map<string, BlendMovie>();
  myMovies.forEach((m) => myMap.set(getMovieKey(m), m));

  const theirMap = new Map<string, BlendMovie>();
  theirMovies.forEach((m) => theirMap.set(getMovieKey(m), m));

  // 1. Identify sharedMovies, onlyMine, and onlyTheirs
  const sharedMovies: BlendMovie[] = [];
  const onlyMine: BlendMovie[] = [];
  const onlyTheirs: BlendMovie[] = [];

  const allIds = new Set<string>();
  myMap.forEach((_, id) => allIds.add(id));
  theirMap.forEach((_, id) => allIds.add(id));

  allIds.forEach((id) => {
    const inMine = myMap.get(id);
    const inTheirs = theirMap.get(id);

    if (inMine && inTheirs) {
      sharedMovies.push({
        ...inMine,
        theirRating: inTheirs.myRating ?? null,
      });
    } else if (inMine) {
      onlyMine.push(inMine);
    } else if (inTheirs) {
      onlyTheirs.push({
        ...inTheirs,
        theirRating: inTheirs.myRating ?? null,
      });
    }
  });

  // 2. 50% Jaccard similarity of movie IDs
  let jaccardScore = 0;
  if (allIds.size > 0) {
    jaccardScore = sharedMovies.length / allIds.size;
  }

  // 3. 30% Cosine similarity of genre-count vectors
  const myGenreCounts = new Map<string, number>();
  const theirGenreCounts = new Map<string, number>();
  const allGenreNames = new Set<string>();

  myMovies.forEach((m) => {
    (m.genres || []).forEach((g) => {
      if (g?.name) {
        myGenreCounts.set(g.name, (myGenreCounts.get(g.name) || 0) + 1);
        allGenreNames.add(g.name);
      }
    });
  });

  theirMovies.forEach((m) => {
    (m.genres || []).forEach((g) => {
      if (g?.name) {
        theirGenreCounts.set(g.name, (theirGenreCounts.get(g.name) || 0) + 1);
        allGenreNames.add(g.name);
      }
    });
  });

  let dotProduct = 0;
  let mag1Sq = 0;
  let mag2Sq = 0;

  allGenreNames.forEach((g) => {
    const v1 = myGenreCounts.get(g) || 0;
    const v2 = theirGenreCounts.get(g) || 0;
    dotProduct += v1 * v2;
    mag1Sq += v1 * v1;
    mag2Sq += v2 * v2;
  });

  let genreCosineScore = 0;
  if (mag1Sq > 0 && mag2Sq > 0) {
    genreCosineScore = dotProduct / (Math.sqrt(mag1Sq) * Math.sqrt(mag2Sq));
  }

  // 4. 20% Rating agreement on shared movies
  // (1 - avg absolute difference / 5; if no shared rated movies use 0.5)
  let ratingAgreementScore = 0.5;
  const sharedRatedDiffs: number[] = [];

  for (const shared of sharedMovies) {
    const id = getMovieKey(shared);
    const m1 = myMap.get(id);
    const m2 = theirMap.get(id);
    const r1 = m1?.myRating;
    const r2 = m2?.myRating;

    if (
      typeof r1 === "number" &&
      r1 > 0 &&
      typeof r2 === "number" &&
      r2 > 0
    ) {
      sharedRatedDiffs.push(Math.abs(r1 - r2));
    }
  }

  if (sharedRatedDiffs.length > 0) {
    const avgDiff =
      sharedRatedDiffs.reduce((a, b) => a + b, 0) / sharedRatedDiffs.length;
    // 1 - avg absolute difference / 5
    ratingAgreementScore = Math.max(0, Math.min(1, 1 - avgDiff / 5));
  }

  // Composite Match Score (0 - 100)
  const rawScore =
    jaccardScore * 50 + genreCosineScore * 30 + ratingAgreementScore * 20;
  const matchScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Match Labels:
  // under 25: "Different universes"
  // 25-50: "Some overlap"
  // 50-75: "Great taste match"
  // 75+: "Movie soulmates"
  let matchLabel = "Different universes";
  if (matchScore >= 75) {
    matchLabel = "Movie soulmates";
  } else if (matchScore >= 50) {
    matchLabel = "Great taste match";
  } else if (matchScore >= 25) {
    matchLabel = "Some overlap";
  }

  // Rank genres by viewer's affinity (for sorting recommendations and strips)
  const genreAffinity = Array.from(myGenreCounts.entries())
    .map(([genre, weight]) => ({ genre, weight }))
    .sort((a, b) => b.weight - a.weight);

  return {
    matchScore,
    matchLabel,
    jaccardScore,
    genreCosineScore,
    ratingAgreementScore,
    sharedMovies,
    onlyMine,
    onlyTheirs,
    genreAffinity,
  };
}

/**
 * Sorts a movie list by viewer's genre affinity so movies in genres
 * the viewer watches most appear first.
 */
export function sortMoviesByGenreAffinity(
  movies: BlendMovie[],
  affinity: Array<{ genre: string; weight: number }>
): BlendMovie[] {
  const weightMap = new Map<string, number>();
  affinity.forEach((item) => weightMap.set(item.genre, item.weight));

  return [...movies].sort((a, b) => {
    let scoreA = 0;
    (a.genres || []).forEach((g) => {
      scoreA += weightMap.get(g.name) || 0;
    });

    let scoreB = 0;
    (b.genres || []).forEach((g) => {
      scoreB += weightMap.get(g.name) || 0;
    });

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // Tie-breaker: rating descending
    const ratingA = a.theirRating ?? a.myRating ?? 0;
    const ratingB = b.theirRating ?? b.myRating ?? 0;
    if (ratingB !== ratingA) {
      return ratingB - ratingA;
    }

    // Secondary tie-breaker: year descending
    return (b.year || "").localeCompare(a.year || "");
  });
}

// 5-minute in-memory cache per pair
const CACHE_TTL_MS = 5 * 60 * 1000;

interface BlendCacheEntry {
  timestamp: number;
  data: BlendResult;
}

const blendCache = new Map<string, BlendCacheEntry>();

/**
 * Retrieves or computes the cached blend result for a specific pair.
 * Keyed by viewerId + ":" + friendId to preserve perspective.
 */
export function getCachedBlend(
  viewerId: string,
  friendId: string,
  viewerMovies: BlendMovie[],
  friendMovies: BlendMovie[]
): BlendResult {
  const cacheKey = `${viewerId}:${friendId}`;
  const now = Date.now();
  const cached = blendCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const result = calculateMatchScore(viewerMovies, friendMovies);
  blendCache.set(cacheKey, { timestamp: now, data: result });
  return result;
}
