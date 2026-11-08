"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { MovieDetails } from "@/lib/tmdb";
import {
  type MovieGraph,
  type MovieNode,
  type RecommendedMovieInput,
  type ConnectionMode,
  rebuildFullGraph,
  addMovie as addMovieToGraph,
  removeMovie as removeMovieFromGraph,
  addRecommendations as addRecsToGraph,
  dismissRecommendation as dismissRecFromGraph,
  markAsWatched as markAsWatchedInGraph,
  setConnectionMode as setConnectionModeInGraph,
  updateMovieRatingAndNoteInGraph,
  updateMovieWatchedOnInGraph,
} from "@/lib/graph";
import {
  loadGraph as loadCloudGraph,
  saveMovie as saveCloudMovie,
  removeMovie as removeCloudMovie,
  updateMovie as updateCloudMovie,
  updateMovieRatingAndNote as updateCloudMovieRatingAndNote,
  updateMovieWatchedOn as updateCloudMovieWatchedOn,
  backfillMissingOriginalLanguages,
  migrateLocalGraph,
} from "@/lib/cloudGraph";
import { useUser } from "@/hooks/useUser";

const STORAGE_KEY = "eclipse-graph";

export function useGraph() {
  const { user, loading: userLoading } = useUser();
  const [graph, setGraph] = useState<MovieGraph>({
    nodes: [],
    links: [],
    watchedNodes: [],
    recommendedNodes: [],
    connectionMode: "genre",
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const graphRef = useRef(graph);
  graphRef.current = graph;

  // Helper to sanitize node (migrate status "root" to "watched", ensure watchedOn & originalLanguage)
  const sanitizeNode = (n: MovieNode): MovieNode => ({
    ...n,
    status: (n.status === "recommended" ? "recommended" : "watched") as
      | "watched"
      | "recommended",
    watchedOn:
      n.watchedOn ||
      (n.addedAt
        ? new Date(n.addedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]),
    originalLanguage: n.originalLanguage || undefined,
  });

  // Helper to read localStorage
  const getLocalStoredGraph = (): {
    watched: MovieNode[];
    recommended: MovieNode[];
  } => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return { watched: [], recommended: [] };
      const parsed = JSON.parse(stored);

      if (Array.isArray(parsed.watchedNodes)) {
        return {
          watched: parsed.watchedNodes.map(sanitizeNode),
          recommended: Array.isArray(parsed.recommendedNodes)
            ? parsed.recommendedNodes.map(sanitizeNode)
            : [],
        };
      } else if (Array.isArray(parsed.nodes)) {
        const sanitized = parsed.nodes.map(sanitizeNode);
        return {
          watched: sanitized.filter((n: MovieNode) => n.status !== "recommended"),
          recommended: sanitized.filter(
            (n: MovieNode) => n.status === "recommended"
          ),
        };
      }
    } catch (e) {
      console.warn("Could not read local graph:", e);
    }
    return { watched: [], recommended: [] };
  };

  // Helper to persist to localStorage (when logged out)
  const persistLocal = (updated: MovieGraph) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          watchedNodes: updated.watchedNodes,
          recommendedNodes: updated.recommendedNodes,
        })
      );
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }
  };

  // Main synchronization on mount and auth state resolution
  useEffect(() => {
    if (userLoading) return;

    let isCurrent = true;

    const synchronize = async () => {
      setSyncError(null);

      // Scenario A: Logged In -> Cloud Sync
      if (user) {
        try {
          const currentMode = graphRef.current.connectionMode;
          const cloudData = await loadCloudGraph(user.id, currentMode);
          const local = getLocalStoredGraph();
          const totalLocalNodes = [...local.watched, ...local.recommended];

          // If cloud map is empty and localStorage has a map, migrate it!
          if (cloudData.nodes.length === 0 && totalLocalNodes.length > 0) {
            await migrateLocalGraph(user.id, totalLocalNodes);
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch (e) {
              console.warn("Could not clear local storage post-migration:", e);
            }

            const migratedCloud = await loadCloudGraph(user.id, currentMode);
            if (isCurrent) {
              setGraph(migratedCloud);
            }
          } else {
            if (isCurrent) {
              setGraph(cloudData);
            }
          }
        } catch (err: unknown) {
          console.error("Failed to sync with cloud graph:", err);
          if (isCurrent) {
            setSyncError("Cloud sync notice: using local fallback.");
            const local = getLocalStoredGraph();
            setGraph(
              rebuildFullGraph(
                local.watched,
                local.recommended,
                graphRef.current.connectionMode
              )
            );
          }
        } finally {
          if (isCurrent) {
            setIsLoaded(true);
          }
        }
      } else {
        // Scenario B: Logged Out -> LocalStorage only
        const local = getLocalStoredGraph();
        if (isCurrent) {
          setGraph(
            rebuildFullGraph(
              local.watched,
              local.recommended,
              graphRef.current.connectionMode
            )
          );
          setIsLoaded(true);
        }
      }
    };

    synchronize();

    return () => {
      isCurrent = false;
    };
  }, [user, userLoading]);

  // Backfill missing originalLanguage for existing movies once per session
  const backfillAttemptedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || backfillAttemptedRef.current) return;
    const currentNodes = graphRef.current.nodes;
    const needsBackfill = currentNodes.some((n) => !n.originalLanguage);
    if (!needsBackfill) return;

    backfillAttemptedRef.current = true;

    backfillMissingOriginalLanguages(currentNodes, user?.id).then((map) => {
      const keys = Object.keys(map);
      if (keys.length === 0) return;

      setGraph((prev) => {
        const updateNode = (n: MovieNode): MovieNode => {
          const lang = map[String(n.id)];
          return lang ? { ...n, originalLanguage: lang } : n;
        };
        const updatedWatched = prev.watchedNodes.map(updateNode);
        const updatedRecs = prev.recommendedNodes.map(updateNode);
        const updated = rebuildFullGraph(
          updatedWatched,
          updatedRecs,
          prev.connectionMode
        );
        if (!user) {
          persistLocal(updated);
        }
        return updated;
      });
    });
  }, [isLoaded, user]);

  // Add Movie
  const addMovie = useCallback(
    async (details: MovieDetails, watchedOn?: string) => {
      const prevGraph = graphRef.current;
      const updated = addMovieToGraph(prevGraph, details, watchedOn);
      setGraph(updated);

      if (!user) {
        persistLocal(updated);
        return;
      }

      const newNode = updated.watchedNodes.find(
        (n) => String(n.id) === String(details.id)
      );

      if (newNode) {
        try {
          await saveCloudMovie(user.id, newNode);
        } catch (err: unknown) {
          console.error("Cloud save failed:", err);
          setSyncError("Failed to save movie to cloud.");
        }
      }
    },
    [user]
  );

  // Remove Movie
  const removeMovie = useCallback(
    async (id: string | number) => {
      const prevGraph = graphRef.current;
      const updated = removeMovieFromGraph(prevGraph, id);
      setGraph(updated);

      if (!user) {
        persistLocal(updated);
        return;
      }

      try {
        await removeCloudMovie(user.id, id);
      } catch (err: unknown) {
        console.error("Cloud remove failed:", err);
        setSyncError("Failed to remove movie from cloud.");
      }
    },
    [user]
  );

  // Add AI Recommendations
  const addRecommendations = useCallback(
    async (recommendations: RecommendedMovieInput[]) => {
      const prevGraph = graphRef.current;
      const updated = addRecsToGraph(prevGraph, recommendations);
      setGraph(updated);

      if (!user) {
        persistLocal(updated);
        return;
      }

      for (const rec of recommendations) {
        const node = updated.recommendedNodes.find(
          (n) => String(n.id) === String(rec.id)
        );
        if (node) {
          try {
            await saveCloudMovie(user.id, node);
          } catch (err) {
            console.error("Failed saving recommendation to cloud:", err);
          }
        }
      }
    },
    [user]
  );

  // Dismiss Recommendation
  const dismissRecommendation = useCallback(
    async (id: string | number) => {
      const prevGraph = graphRef.current;
      const updated = dismissRecFromGraph(prevGraph, id);
      setGraph(updated);

      if (!user) {
        persistLocal(updated);
        return;
      }

      try {
        await removeCloudMovie(user.id, id);
      } catch (err) {
        console.error("Failed dismissing recommendation from cloud:", err);
      }
    },
    [user]
  );

  // Mark as Watched
  const markAsWatched = useCallback(
    async (id: string | number, watchedOn?: string) => {
      const prevGraph = graphRef.current;
      const updated = markAsWatchedInGraph(prevGraph, id, watchedOn);
      setGraph(updated);

      if (!user) {
        persistLocal(updated);
        return;
      }

      const promotedNode = updated.watchedNodes.find(
        (n) => String(n.id) === String(id)
      );

      if (promotedNode) {
        try {
          await updateCloudMovie(user.id, promotedNode);
        } catch (err) {
          console.error("Failed updating watched status in cloud:", err);
          setSyncError("Failed to sync watched status with cloud.");
        }
      }
    },
    [user]
  );

  // Switch Connection Mode (Genre, Director, Cast, Decade)
  const setConnectionMode = useCallback((mode: ConnectionMode) => {
    setGraph((prev) => setConnectionModeInGraph(prev, mode));
  }, []);

  // Reset / Clear graph
  const clearGraph = useCallback(() => {
    const empty: MovieGraph = {
      nodes: [],
      links: [],
      watchedNodes: [],
      recommendedNodes: [],
      connectionMode: "genre",
    };
    setGraph(empty);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear local graph:", e);
    }
  }, []);

  // Update personal rating and note
  const updateRatingAndNote = useCallback(
    async (id: string | number, rating: number | null, note: string | null) => {
      const prevGraph = graphRef.current;
      const updated = updateMovieRatingAndNoteInGraph(
        prevGraph,
        id,
        rating,
        note
      );
      setGraph(updated);

      if (!user) {
        persistLocal(updated);
        return;
      }

      try {
        await updateCloudMovieRatingAndNote(user.id, id, rating, note);
      } catch (err) {
        console.error("Failed updating rating and note in cloud:", err);
        setSyncError("Failed to save rating to cloud.");
      }
    },
    [user]
  );

  // Update watchedOn date
  const updateWatchedOn = useCallback(
    async (id: string | number, watchedOn: string) => {
      const prevGraph = graphRef.current;
      const updated = updateMovieWatchedOnInGraph(prevGraph, id, watchedOn);
      setGraph(updated);

      if (!user) {
        persistLocal(updated);
        return;
      }

      try {
        await updateCloudMovieWatchedOn(user.id, id, watchedOn);
      } catch (err) {
        console.error("Failed updating watchedOn date in cloud:", err);
        setSyncError("Failed to save watched date to cloud.");
      }
    },
    [user]
  );

  return {
    graph,
    watchedNodes: graph.watchedNodes,
    recommendedNodes: graph.recommendedNodes,
    connectionMode: graph.connectionMode,
    setConnectionMode,
    addMovie,
    removeMovie,
    addRecommendations,
    dismissRecommendation,
    markAsWatched,
    updateRatingAndNote,
    updateWatchedOn,
    clearGraph,
    isLoaded: isLoaded && !userLoading,
    isCloudSync: Boolean(user),
    syncError,
  };
}
