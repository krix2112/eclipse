import type { MovieDetails, MovieGenre } from "@/lib/tmdb";

export type ConnectionMode = "genre" | "director" | "cast" | "decade";

export interface MovieNode {
  id: string | number;
  title: string;
  year: string;
  posterPath: string | null;
  genres: MovieGenre[];
  status: "watched" | "recommended";
  addedAt: number;
  watchedOn?: string; // ISO date string (YYYY-MM-DD) or year only (YYYY)
  overview?: string;
  director?: string;
  cast?: string[];
  keywords?: string[];
  decade?: string;
  voteAverage?: number;
  originalLanguage?: string;
  myRating?: number | null;
  myNote?: string | null;
  // Specific to AI Recommended nodes
  reason?: string;
  connectsToId?: string | number;
  kind?: "similar" | "stretch";
  // Canvas simulation coordinates injected by react-force-graph
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface MovieLink {
  source: string | number | MovieNode;
  target: string | number | MovieNode;
  type: "genre" | "bridge" | "recommend" | "director" | "cast" | "decade";
  reason: string;
  genre?: string;
}

export interface MovieGraph {
  nodes: MovieNode[];
  links: MovieLink[];
  watchedNodes: MovieNode[];
  recommendedNodes: MovieNode[];
  connectionMode: ConnectionMode;
}

export interface RecommendedMovieInput {
  id: number | string;
  title: string;
  year: string;
  posterPath: string | null;
  genres: MovieGenre[];
  overview?: string;
  reason: string;
  connectsToId: number | string;
  director?: string;
  cast?: string[];
  decade?: string;
  kind?: "similar" | "stretch";
  voteAverage?: number;
}

/**
 * Computes a decade string from a year value (e.g. "2014" -> "2010s").
 */
export function getDecadeFromYear(year?: string): string {
  if (!year) return "Unknown era";
  const num = parseInt(year, 10);
  if (isNaN(num) || num < 1880) return "Unknown era";
  return `${Math.floor(num / 10) * 10}s`;
}

/**
 * Parses timestamp value from watchedOn (or falls back to addedAt / release year).
 */
export function getNodeWatchedTime(node: {
  watchedOn?: string;
  addedAt?: number;
  year?: string;
}): number {
  if (node.watchedOn) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(node.watchedOn)) {
      const t = new Date(node.watchedOn).getTime();
      if (!isNaN(t)) return t;
    } else if (/^\d{4}$/.test(node.watchedOn)) {
      const t = new Date(`${node.watchedOn}-01-01`).getTime();
      if (!isNaN(t)) return t;
    }
  }
  if (node.addedAt) return node.addedAt;
  if (node.year && /^\d{4}$/.test(node.year)) {
    const t = new Date(`${node.year}-01-01`).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

/**
 * Rebuilds all links from scratch separating watched and recommended nodes,
 * according to the selected connectionMode (genre, director, cast, or decade).
 * All user movies are "watched" (root concept removed).
 */
export function rebuildFullGraph(
  watchedNodes: MovieNode[],
  recommendedNodes: MovieNode[] = [],
  connectionMode: ConnectionMode = "genre"
): MovieGraph {
  if (!watchedNodes || watchedNodes.length === 0) {
    return {
      nodes: [],
      links: [],
      watchedNodes: [],
      recommendedNodes: [],
      connectionMode,
    };
  }

  // Ensure decade, credits, and watchedOn exist on all nodes.
  // Clean migration: map any incoming status "root" to "watched".
  // Sort watched nodes chronologically by watched date ascending.
  const sortedWatched: MovieNode[] = [...watchedNodes]
    .sort((a, b) => getNodeWatchedTime(a) - getNodeWatchedTime(b))
    .map((node) => {
      const watchedOn =
        node.watchedOn ||
        (node.addedAt
          ? new Date(node.addedAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0]);

      return {
        ...node,
        status: "watched" as const,
        watchedOn,
        decade: node.decade || getDecadeFromYear(node.year),
        director: node.director || "Unknown Director",
        cast: Array.isArray(node.cast) ? node.cast : [],
      };
    });

  const links: MovieLink[] = [];

  // Build links among watched nodes based on active mode
  for (let i = 0; i < sortedWatched.length; i++) {
    const current = sortedWatched[i];
    const priorNodes = sortedWatched.slice(0, i);

    if (connectionMode === "director") {
      let matchedTarget: MovieNode | null = null;
      if (current.director && current.director !== "Unknown Director") {
        for (let j = priorNodes.length - 1; j >= 0; j--) {
          if (priorNodes[j].director === current.director) {
            matchedTarget = priorNodes[j];
            break;
          }
        }
      }

      if (matchedTarget) {
        links.push({
          source: current.id,
          target: matchedTarget.id,
          type: "director",
          reason: `Directed by ${current.director}`,
        });
      }
    } else if (connectionMode === "cast") {
      let matchedTarget: MovieNode | null = null;
      let sharedActor = "";

      if (current.cast && current.cast.length > 0) {
        for (let j = priorNodes.length - 1; j >= 0; j--) {
          const candidate = priorNodes[j];
          const shared = current.cast.find((actor) =>
            candidate.cast?.includes(actor)
          );
          if (shared) {
            matchedTarget = candidate;
            sharedActor = shared;
            break;
          }
        }
      }

      if (matchedTarget && sharedActor) {
        links.push({
          source: current.id,
          target: matchedTarget.id,
          type: "cast",
          reason: `Shared actor: ${sharedActor}`,
        });
      }
    } else if (connectionMode === "decade") {
      let matchedTarget: MovieNode | null = null;
      const currentDecade = current.decade || getDecadeFromYear(current.year);

      if (currentDecade && currentDecade !== "Unknown era") {
        for (let j = priorNodes.length - 1; j >= 0; j--) {
          if (priorNodes[j].decade === currentDecade) {
            matchedTarget = priorNodes[j];
            break;
          }
        }
      }

      if (matchedTarget) {
        links.push({
          source: current.id,
          target: matchedTarget.id,
          type: "decade",
          reason: `Both from the ${currentDecade}`,
        });
      }
    } else {
      // Default: Genre mode (with Bridge links)
      // Connect each movie to the previous movie in the same primary genre
      const primaryGenre = current.genres[0]?.name;
      const secondaryGenre = current.genres[1]?.name;

      let genreTarget: MovieNode | null = null;

      if (primaryGenre) {
        for (let j = priorNodes.length - 1; j >= 0; j--) {
          if (priorNodes[j].genres[0]?.name === primaryGenre) {
            genreTarget = priorNodes[j];
            break;
          }
        }
      }

      if (genreTarget) {
        links.push({
          source: current.id,
          target: genreTarget.id,
          type: "genre",
          genre: primaryGenre,
          reason: `Both ${primaryGenre}`,
        });
      }
      // No link to a root when a group has only one movie

      // Bridge link (second genre) - keep bridge/interchange logic unchanged
      if (secondaryGenre) {
        for (let j = priorNodes.length - 1; j >= 0; j--) {
          const candidate = priorNodes[j];
          const hasGenre = candidate.genres.some((g) => g.name === secondaryGenre);
          const currentGenreTargetId = genreTarget ? genreTarget.id : null;

          if (
            hasGenre &&
            (!currentGenreTargetId || String(candidate.id) !== String(currentGenreTargetId))
          ) {
            links.push({
              source: current.id,
              target: candidate.id,
              type: "bridge",
              genre: secondaryGenre,
              reason: `Bridge: Both ${secondaryGenre}`,
            });
            break;
          }
        }
      }
    }
  }

  // Recommendations: always linked from connectsTo movie with reason
  const watchedIdSet = new Set(sortedWatched.map((n) => String(n.id)));
  const validRecommended: MovieNode[] = [];

  for (const rec of recommendedNodes) {
    if (watchedIdSet.has(String(rec.id))) {
      continue;
    }

    let targetId = rec.connectsToId;
    if (!targetId || !watchedIdSet.has(String(targetId))) {
      // Connect to the latest watched movie if connectsTo is missing
      targetId = sortedWatched[sortedWatched.length - 1]?.id;
    }

    if (!targetId) continue;

    const recNode: MovieNode = {
      ...rec,
      status: "recommended",
      connectsToId: targetId,
      decade: rec.decade || getDecadeFromYear(rec.year),
      kind: rec.kind || "similar",
    };

    validRecommended.push(recNode);

    links.push({
      source: targetId,
      target: recNode.id,
      type: "recommend",
      reason: rec.reason || "AI Recommendation",
    });
  }

  return {
    nodes: [...sortedWatched, ...validRecommended],
    links,
    watchedNodes: sortedWatched,
    recommendedNodes: validRecommended,
    connectionMode,
  };
}

/**
 * Adds a movie to the watched list.
 */
export function addMovie(
  graph: MovieGraph,
  movieDetails: MovieDetails,
  watchedOn?: string
): MovieGraph {
  const existingWatched = graph.watchedNodes.some(
    (n) => String(n.id) === String(movieDetails.id)
  );
  if (existingWatched) {
    return graph;
  }

  const defaultWatchedOn =
    watchedOn || new Date().toISOString().split("T")[0];

  const newNode: MovieNode = {
    id: movieDetails.id,
    title: movieDetails.title,
    year: movieDetails.release_year,
    posterPath: movieDetails.poster_path,
    genres: movieDetails.genres || [],
    status: "watched",
    addedAt: Date.now(),
    watchedOn: defaultWatchedOn,
    overview: movieDetails.overview,
    director: movieDetails.director,
    cast: movieDetails.cast,
    keywords: movieDetails.keywords,
    decade: movieDetails.decade || getDecadeFromYear(movieDetails.release_year),
    voteAverage: movieDetails.vote_average,
    originalLanguage: movieDetails.original_language || "en",
  };

  const newWatched = [...graph.watchedNodes, newNode];
  const remainingRecs = graph.recommendedNodes.filter(
    (n) => String(n.id) !== String(movieDetails.id)
  );

  return rebuildFullGraph(newWatched, remainingRecs, graph.connectionMode);
}

/**
 * Removes a movie by id.
 */
export function removeMovie(
  graph: MovieGraph,
  id: string | number
): MovieGraph {
  const remainingWatched = graph.watchedNodes.filter(
    (n) => String(n.id) !== String(id)
  );
  const remainingRecs = graph.recommendedNodes.filter(
    (n) => String(n.id) !== String(id)
  );

  return rebuildFullGraph(remainingWatched, remainingRecs, graph.connectionMode);
}

/**
 * Adds AI recommended movies to the graph.
 */
export function addRecommendations(
  graph: MovieGraph,
  recommendations: RecommendedMovieInput[]
): MovieGraph {
  if (graph.watchedNodes.length === 0 || !recommendations.length) {
    return graph;
  }

  const watchedIdSet = new Set(graph.watchedNodes.map((n) => String(n.id)));
  const recIdSet = new Set(graph.recommendedNodes.map((n) => String(n.id)));

  const newRecNodes: MovieNode[] = [];

  for (const item of recommendations) {
    const idStr = String(item.id);
    if (watchedIdSet.has(idStr) || recIdSet.has(idStr)) {
      continue;
    }

    newRecNodes.push({
      id: item.id,
      title: item.title,
      year: item.year,
      posterPath: item.posterPath,
      genres: item.genres || [],
      status: "recommended",
      addedAt: Date.now(),
      overview: item.overview,
      reason: item.reason,
      connectsToId: item.connectsToId,
      director: item.director,
      cast: item.cast,
      decade: item.decade || getDecadeFromYear(item.year),
      kind: item.kind || "similar",
      voteAverage: item.voteAverage,
    });

    recIdSet.add(idStr);
  }

  const updatedRecs = [...graph.recommendedNodes, ...newRecNodes];
  return rebuildFullGraph(graph.watchedNodes, updatedRecs, graph.connectionMode);
}

/**
 * Dismisses a recommended node from the graph.
 */
export function dismissRecommendation(
  graph: MovieGraph,
  id: string | number
): MovieGraph {
  const remainingRecs = graph.recommendedNodes.filter(
    (n) => String(n.id) !== String(id)
  );
  return rebuildFullGraph(graph.watchedNodes, remainingRecs, graph.connectionMode);
}

/**
 * Converts a recommended (R) node into a normal watched node.
 */
export function markAsWatched(
  graph: MovieGraph,
  id: string | number,
  watchedOn?: string
): MovieGraph {
  const targetRec = graph.recommendedNodes.find(
    (n) => String(n.id) === String(id)
  );

  if (!targetRec) {
    return graph;
  }

  const defaultWatchedOn =
    watchedOn || new Date().toISOString().split("T")[0];

  const watchedNode: MovieNode = {
    ...targetRec,
    status: "watched",
    addedAt: Date.now(),
    watchedOn: defaultWatchedOn,
    reason: undefined,
    connectsToId: undefined,
    kind: undefined,
  };

  const newWatched = [...graph.watchedNodes, watchedNode];
  const remainingRecs = graph.recommendedNodes.filter(
    (n) => String(n.id) !== String(id)
  );

  return rebuildFullGraph(newWatched, remainingRecs, graph.connectionMode);
}

/**
 * Changes connection mode (genre | director | cast | decade) and rebuilds links.
 */
export function setConnectionMode(
  graph: MovieGraph,
  mode: ConnectionMode
): MovieGraph {
  return rebuildFullGraph(graph.watchedNodes, graph.recommendedNodes, mode);
}

/**
 * Updates user rating and personal note on a movie node in the graph.
 */
export function updateMovieRatingAndNoteInGraph(
  graph: MovieGraph,
  id: string | number,
  rating: number | null,
  note: string | null
): MovieGraph {
  const idStr = String(id);
  const updatedWatched = graph.watchedNodes.map((n) =>
    String(n.id) === idStr ? { ...n, myRating: rating, myNote: note } : n
  );
  const updatedRecs = graph.recommendedNodes.map((n) =>
    String(n.id) === idStr ? { ...n, myRating: rating, myNote: note } : n
  );
  return rebuildFullGraph(updatedWatched, updatedRecs, graph.connectionMode);
}

/**
 * Updates watchedOn date for a movie node in the graph and rebuilds links.
 */
export function updateMovieWatchedOnInGraph(
  graph: MovieGraph,
  id: string | number,
  watchedOn: string
): MovieGraph {
  const idStr = String(id);
  const updatedWatched = graph.watchedNodes.map((n) =>
    String(n.id) === idStr ? { ...n, watchedOn } : n
  );
  return rebuildFullGraph(updatedWatched, graph.recommendedNodes, graph.connectionMode);
}
