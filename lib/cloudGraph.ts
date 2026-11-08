import { supabase } from "@/lib/supabase";
import {
  type MovieGraph,
  type MovieNode,
  type ConnectionMode,
  rebuildFullGraph,
  getDecadeFromYear,
} from "@/lib/graph";

/**
 * Loads the user's movie graph from Supabase.
 * Maps columns from user_movies table and deterministically rebuilds all links.
 * All incoming status "root" movies are cleanly migrated to "watched".
 */
export async function loadGraph(
  userId: string,
  mode: ConnectionMode = "genre"
): Promise<MovieGraph> {
  const { data, error } = await supabase
    .from("user_movies")
    .select("*")
    .eq("user_id", userId)
    .order("added_at", { ascending: true });

  if (error) {
    throw error;
  }

  const nodes: MovieNode[] = (data || []).map((row) => {
    const rawReason = row.reason || "";
    let kind: "similar" | "stretch" | undefined = undefined;
    let cleanReason = rawReason;
    if (rawReason.startsWith("[stretch] ")) {
      kind = "stretch";
      cleanReason = rawReason.replace("[stretch] ", "");
    } else if (rawReason.startsWith("[similar] ")) {
      kind = "similar";
      cleanReason = rawReason.replace("[similar] ", "");
    }

    const watchedOn = row.watched_on
      ? String(row.watched_on)
      : row.added_at
      ? new Date(row.added_at).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    return {
      id: row.tmdb_id,
      title: row.title,
      year: row.year || "",
      posterPath: row.poster_path ?? null,
      genres: Array.isArray(row.genres) ? row.genres : [],
      status: (row.status === "recommended" ? "recommended" : "watched") as
        | "watched"
        | "recommended",
      addedAt: row.added_at ? new Date(row.added_at).getTime() : Date.now(),
      watchedOn,
      overview: row.overview || "",
      reason: cleanReason || undefined,
      connectsToId: row.connects_to_id || undefined,
      decade: getDecadeFromYear(row.year),
      kind: row.status === "recommended" ? kind || "similar" : undefined,
      myRating:
        row.my_rating !== undefined && row.my_rating !== null
          ? Number(row.my_rating)
          : null,
      myNote: row.my_note ?? null,
      originalLanguage: row.original_language || undefined,
    };
  });

  const watched = nodes.filter((n) => n.status !== "recommended");
  const recommended = nodes.filter((n) => n.status === "recommended");

  return rebuildFullGraph(watched, recommended, mode);
}

/**
 * Saves a single movie node into Supabase user_movies table.
 */
export async function saveMovie(userId: string, node: MovieNode): Promise<void> {
  let reasonToSave = node.reason || null;
  if (node.status === "recommended" && reasonToSave && node.kind) {
    if (!reasonToSave.startsWith(`[${node.kind}] `)) {
      reasonToSave = `[${node.kind}] ${reasonToSave}`;
    }
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    tmdb_id: Number(node.id),
    title: node.title,
    year: node.year || "",
    poster_path: node.posterPath || null,
    genres: node.genres || [],
    status: node.status,
    overview: node.overview || "",
    reason: reasonToSave,
    connects_to_id: node.connectsToId ? Number(node.connectsToId) : null,
    added_at: new Date(node.addedAt || Date.now()).toISOString(),
    my_rating: node.myRating ?? null,
    my_note: node.myNote ?? null,
    watched_on: node.watchedOn || new Date().toISOString().split("T")[0],
    original_language: node.originalLanguage || null,
  };

  // Check if row already exists for this user and movie
  const { data: existing, error: checkError } = await supabase
    .from("user_movies")
    .select("id")
    .eq("user_id", userId)
    .eq("tmdb_id", Number(node.id))
    .maybeSingle();

  if (checkError) {
    throw checkError;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("user_movies")
      .update(payload)
      .eq("id", existing.id);

    if (updateError) {
      // If watched_on or original_language column does not exist in DB yet, fallback gracefully
      if (updateError.code === "42703") {
        delete payload.watched_on;
        delete payload.original_language;
        const { error: retryError } = await supabase
          .from("user_movies")
          .update(payload)
          .eq("id", existing.id);
        if (retryError) throw retryError;
      } else {
        throw updateError;
      }
    }
  } else {
    const { error: insertError } = await supabase
      .from("user_movies")
      .insert(payload);

    if (insertError) {
      if (insertError.code === "42703") {
        delete payload.watched_on;
        delete payload.original_language;
        const { error: retryError } = await supabase
          .from("user_movies")
          .insert(payload);
        if (retryError) throw retryError;
      } else {
        throw insertError;
      }
    }
  }
}

/**
 * Removes a movie from Supabase user_movies table.
 */
export async function removeMovie(
  userId: string,
  tmdbId: string | number
): Promise<void> {
  const { error } = await supabase
    .from("user_movies")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_id", Number(tmdbId));

  if (error) {
    throw error;
  }
}

/**
 * Updates status and metadata for an existing movie node (e.g. recommended -> watched).
 */
export async function updateMovie(
  userId: string,
  node: MovieNode
): Promise<void> {
  const payload: Record<string, unknown> = {
    status: node.status,
    reason: node.reason || null,
    connects_to_id: node.connectsToId ? Number(node.connectsToId) : null,
    added_at: new Date(node.addedAt || Date.now()).toISOString(),
    watched_on: node.watchedOn || new Date().toISOString().split("T")[0],
    original_language: node.originalLanguage || null,
  };

  const { error } = await supabase
    .from("user_movies")
    .update(payload)
    .eq("user_id", userId)
    .eq("tmdb_id", Number(node.id));

  if (error) {
    if (error.code === "42703") {
      delete payload.watched_on;
      delete payload.original_language;
      const { error: retryError } = await supabase
        .from("user_movies")
        .update(payload)
        .eq("user_id", userId)
        .eq("tmdb_id", Number(node.id));
      if (retryError) throw retryError;
    } else {
      throw error;
    }
  }
}

/**
 * Updates personal 5-star rating and note for a movie in Supabase.
 */
export async function updateMovieRatingAndNote(
  userId: string,
  tmdbId: string | number,
  rating: number | null,
  note: string | null
): Promise<void> {
  const { error } = await supabase
    .from("user_movies")
    .update({
      my_rating: rating,
      my_note: note,
    })
    .eq("user_id", userId)
    .eq("tmdb_id", Number(tmdbId));

  if (error) {
    throw error;
  }
}

/**
 * Updates watched_on date for a movie in Supabase.
 */
export async function updateMovieWatchedOn(
  userId: string,
  tmdbId: string | number,
  watchedOn: string
): Promise<void> {
  const { error } = await supabase
    .from("user_movies")
    .update({
      watched_on: watchedOn,
    })
    .eq("user_id", userId)
    .eq("tmdb_id", Number(tmdbId));

  if (error && error.code !== "42703") {
    throw error;
  }
}

/**
 * Updates original_language for a movie in Supabase.
 */
export async function updateMovieOriginalLanguage(
  userId: string,
  tmdbId: string | number,
  originalLanguage: string
): Promise<void> {
  const { error } = await supabase
    .from("user_movies")
    .update({
      original_language: originalLanguage,
    })
    .eq("user_id", userId)
    .eq("tmdb_id", Number(tmdbId));

  if (error && error.code !== "42703") {
    console.warn("Failed to update original_language in cloud:", error);
  }
}

/**
 * Backfills missing originalLanguage for existing movies in small batches (5 at a time).
 * Fetches from /api/movies/[id] and updates Supabase if userId is provided.
 * Returns a record mapping tmdbId to the detected language.
 */
export async function backfillMissingOriginalLanguages(
  nodes: MovieNode[],
  userId?: string
): Promise<Record<string, string>> {
  const missing = nodes.filter((n) => !n.originalLanguage);
  if (missing.length === 0) return {};

  const updatedMap: Record<string, string> = {};
  const batchSize = 5;

  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (node) => {
        try {
          const res = await fetch(`/api/movies/${node.id}`);
          if (!res.ok) return;
          const data = await res.json();
          const lang = (data.original_language as string) || "en";
          updatedMap[String(node.id)] = lang;
          if (userId) {
            await updateMovieOriginalLanguage(userId, node.id, lang);
          }
        } catch (err) {
          console.warn(`Could not backfill language for movie ${node.id}:`, err);
        }
      })
    );
  }

  return updatedMap;
}

/**
 * Migrates a batch of movie nodes from localStorage to Supabase.
 */
export async function migrateLocalGraph(
  userId: string,
  nodes: MovieNode[]
): Promise<void> {
  for (const node of nodes) {
    await saveMovie(userId, node);
  }
}
