import { NextRequest, NextResponse } from "next/server";
import { searchMovies, getMovieDetails } from "@/lib/tmdb";

interface WatchedMovieInput {
  id: string | number;
  title: string;
  year?: string;
  genres?: Array<{ id: number; name: string }>;
}

export interface RawAiRecommendation {
  title: string;
  year?: string;
  reason: string;
  connectsTo: string;
  kind: "similar" | "stretch";
}

export interface ResolvedRecommendation {
  id: number;
  title: string;
  year: string;
  posterPath: string | null;
  genres: Array<{ id: number; name: string }>;
  overview: string;
  reason: string;
  connectsTo: string;
  connectsToId: string | number;
  kind: "similar" | "stretch";
  director?: string;
  cast?: string[];
  decade?: string;
  voteAverage?: number;
}

interface CacheEntry {
  timestamp: number;
  recommendations: ResolvedRecommendation[];
}

// 10-minute in-memory cache keyed by sorted watched movie IDs
const CACHE_TTL_MS = 10 * 60 * 1000;
const recommendationsCache = new Map<string, CacheEntry>();

function getCacheKey(movies: WatchedMovieInput[]): string {
  return movies
    .map((m) => String(m.id))
    .sort()
    .join(",");
}

/**
 * Strips markdown code block fences and parses JSON safely into recommendations.
 */
function parseJsonArray(
  rawText: string,
  expectedKind: "similar" | "stretch"
): RawAiRecommendation[] {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(cleaned);
  let array: unknown[] = [];

  if (Array.isArray(parsed)) {
    array = parsed;
  } else if (parsed && typeof parsed === "object") {
    // Check if the response was an object wrapping an array, e.g. { recommendations: [...] }
    const possibleArr = Object.values(parsed).find((v) => Array.isArray(v));
    if (possibleArr && Array.isArray(possibleArr)) {
      array = possibleArr;
    }
  }

  const results: RawAiRecommendation[] = [];
  for (const item of array) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    if (!title) continue;

    const year = rec.year !== undefined && rec.year !== null ? String(rec.year).trim() : "";
    const reason = typeof rec.reason === "string" ? rec.reason.trim() : "";
    const connectsTo = typeof rec.connectsTo === "string" ? rec.connectsTo.trim() : "";
    const kind =
      rec.kind === "stretch" || rec.kind === "similar"
        ? (rec.kind as "similar" | "stretch")
        : expectedKind;

    results.push({
      title,
      year,
      reason,
      connectsTo,
      kind,
    });
  }

  return results;
}

/**
 * Calls Groq chat completions API for 3 "Similar picks".
 * Enforces 15s timeout and auto-falls back to available models.
 */
async function callGroq(
  watchedSummary: Array<{ title: string; year?: string; genres: string }>,
  apiKey: string
): Promise<RawAiRecommendation[]> {
  const prompt = `You are a cinematic universe recommendation engine for Eclipse.
Here is the user's watched movie history:
${JSON.stringify(watchedSummary, null, 2)}

Provide exactly 3 "Similar picks" - movies closely aligned with the tone, themes, and style of the user's watched taste, that the user has NOT watched yet.
Every recommended movie MUST link directly to one watched movie from the list above.
The reason must be one short sentence explaining the link to the user's taste (e.g. "Mind-bending sci-fi like Inception, with a darker tone").

Respond ONLY with a JSON object in this format:
{
  "recommendations": [
    {
      "title": "Movie Title",
      "year": "YYYY",
      "reason": "One concise sentence explaining connection to watched movie",
      "connectsTo": "Title of one watched movie from the list above",
      "kind": "similar"
    }
  ]
}`;

  const defaultModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const candidateModels = Array.from(
    new Set([defaultModel, "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"])
  );

  let lastError = "";

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a movie recommendation assistant. Always respond with valid JSON output only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        lastError = `[Groq ${model}] HTTP ${response.status}: ${errText}`;
        console.warn(lastError);
        continue;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        return parseJsonArray(content, "similar");
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      lastError = isAbort
        ? `[Groq ${model}] Timed out after 15s`
        : `[Groq ${model}] ${err instanceof Error ? err.message : "Error"}`;
      console.warn(lastError);
    }
  }

  throw new Error(lastError || "Groq recommendation failed on all candidate models.");
}

/**
 * Calls Gemini API for 3 "Stretch picks".
 * Enforces 15s timeout and auto-falls back across active models.
 */
async function callGemini(
  watchedSummary: Array<{ title: string; year?: string; genres: string }>,
  apiKey: string
): Promise<RawAiRecommendation[]> {
  const prompt = `You are a cinematic universe recommendation engine for Eclipse.
Here is the user's watched movie history:
${JSON.stringify(watchedSummary, null, 2)}

Provide exactly 3 "Stretch picks" - movies that bridge to a genre or style the user has watched little of or never explored, serving as an exciting stepping stone into new genres while still anchored to their taste.
The user must NOT have watched these recommended movies yet.
Every recommended movie MUST link directly to one watched movie from the list above.
The reason must be one short sentence explaining the bridge (e.g. "A stylish neo-noir thriller that bridges Inception's mystery into classic detective crime").

Respond ONLY with a valid JSON array matching this exact schema:
[
  {
    "title": "Movie Title",
    "year": "YYYY",
    "reason": "One concise sentence explaining how it stretches and bridges to the watched movie",
    "connectsTo": "Title of one watched movie from the list above",
    "kind": "stretch"
  }
]`;

  const envModels = (process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || "gemini-2.0-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const fallbackChain = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-flash-latest",
  ];
  const candidateModels = Array.from(new Set([...envModels, ...fallbackChain]));

  let lastError = "";

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
          },
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        const errDetail = errJson?.error?.message || `HTTP ${response.status}`;
        lastError = `[Gemini ${model}] ${errDetail}`;
        console.warn(lastError);
        continue;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return parseJsonArray(text, "stretch");
      }
    } catch (err: unknown) {
      clearTimeout(timeout);
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
      lastError = isAbort
        ? `[Gemini ${model}] Timed out after 15s`
        : `[Gemini ${model}] ${err instanceof Error ? err.message : "Error"}`;
      console.warn(lastError);
    }
  }

  throw new Error(lastError || "Gemini recommendation failed on all candidate models.");
}

/**
 * POST /api/recommend
 */
export async function POST(request: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    const groqKey = process.env.GROQ_API_KEY?.trim();

    if (!geminiKey && !groqKey) {
      return NextResponse.json(
        {
          error: "No AI provider keys configured. Add GROQ_API_KEY or GEMINI_API_KEY in .env.local",
          recommendations: [],
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const watchedMovies: WatchedMovieInput[] = body?.watchedMovies || [];

    if (!Array.isArray(watchedMovies) || watchedMovies.length < 3) {
      return NextResponse.json(
        {
          error: "Add at least 3 watched movies to get AI recommendations.",
          recommendations: [],
        },
        { status: 400 }
      );
    }

    // Check 10-minute in-memory cache keyed by sorted watched movie IDs
    const cacheKey = getCacheKey(watchedMovies);
    const cached = recommendationsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(
        { recommendations: cached.recommendations, cached: true },
        { status: 200 }
      );
    }

    const watchedSummary = watchedMovies.map((m) => ({
      title: m.title,
      year: m.year,
      genres: (m.genres || []).map((g) => g.name).join(", "),
    }));

    // 2. Run in parallel with Promise.allSettled and a 15s timeout each
    const [groqSettled, geminiSettled] = await Promise.allSettled([
      groqKey
        ? callGroq(watchedSummary, groqKey)
        : Promise.reject(new Error("GROQ_API_KEY is not configured")),
      geminiKey
        ? callGemini(watchedSummary, geminiKey)
        : Promise.reject(new Error("GEMINI_API_KEY is not configured")),
    ]);

    const groqPicks: RawAiRecommendation[] =
      groqSettled.status === "fulfilled" ? groqSettled.value : [];
    const geminiPicks: RawAiRecommendation[] =
      geminiSettled.status === "fulfilled" ? geminiSettled.value : [];

    // 4. If both fail, return a clear error
    if (groqPicks.length === 0 && geminiPicks.length === 0) {
      const groqMsg =
        groqSettled.status === "rejected" ? groqSettled.reason?.message : "No results returned";
      const geminiMsg =
        geminiSettled.status === "rejected" ? geminiSettled.reason?.message : "No results returned";
      return NextResponse.json(
        {
          error: `Both AI providers failed. Groq: ${groqMsg}. Gemini: ${geminiMsg}.`,
          recommendations: [],
        },
        { status: 502 }
      );
    }

    // 3. Merge, dedupe by title+year, remove already-watched movies
    const mergedRaw = [...groqPicks, ...geminiPicks];

    const watchedTitleSet = new Set(
      watchedMovies.map((m) => m.title.toLowerCase().trim())
    );
    const watchedIdSet = new Set(watchedMovies.map((m) => String(m.id)));

    const seenCandidates = new Set<string>();
    const deduplicatedCandidates: RawAiRecommendation[] = [];

    for (const rec of mergedRaw) {
      const titleClean = rec.title.toLowerCase().trim();
      if (!titleClean) continue;
      if (watchedTitleSet.has(titleClean)) continue;

      const dedupeKey = `${titleClean}|${rec.year || ""}`;
      if (seenCandidates.has(dedupeKey)) continue;
      seenCandidates.add(dedupeKey);
      deduplicatedCandidates.push(rec);
    }

    // Resolve all items through TMDB in parallel (Promise.all). Drop unresolved ones.
    const resolvedPromises = deduplicatedCandidates.map(
      async (rec): Promise<ResolvedRecommendation | null> => {
        try {
          const searchResults = await searchMovies(rec.title);
          if (!searchResults || searchResults.length === 0) return null;

          let match = searchResults[0];
          if (rec.year) {
            const yearMatch = searchResults.find(
              (m) => m.release_year === String(rec.year)
            );
            if (yearMatch) match = yearMatch;
          }

          const matchIdStr = String(match.id);
          const matchTitleClean = match.title.toLowerCase().trim();

          if (
            watchedIdSet.has(matchIdStr) ||
            watchedTitleSet.has(matchTitleClean)
          ) {
            return null;
          }

          const details = await getMovieDetails(match.id);

          const connectsToClean = (rec.connectsTo || "").toLowerCase().trim();
          const matchedWatched =
            watchedMovies.find(
              (m) =>
                m.title.toLowerCase().trim() === connectsToClean ||
                connectsToClean.includes(m.title.toLowerCase().trim())
            ) || watchedMovies[0];

          return {
            id: details.id,
            title: details.title,
            year: details.release_year,
            posterPath: details.poster_path,
            genres: details.genres || [],
            overview: details.overview || "",
            reason: rec.reason || `Connected to ${matchedWatched.title}`,
            connectsTo: matchedWatched.title,
            connectsToId: matchedWatched.id,
            kind: rec.kind,
            director: details.director,
            cast: details.cast,
            decade: details.decade,
            voteAverage: details.vote_average,
          };
        } catch (err: unknown) {
          console.warn(
            `[/api/recommend] Failed to resolve TMDB details for "${rec.title}":`,
            err
          );
          return null;
        }
      }
    );

    const resolvedItems = await Promise.all(resolvedPromises);

    // Keep unique valid movies by TMDB id
    const finalResolved: ResolvedRecommendation[] = [];
    const resolvedIdSet = new Set<string>();

    for (const item of resolvedItems) {
      if (!item) continue;
      const idStr = String(item.id);
      if (watchedIdSet.has(idStr) || resolvedIdSet.has(idStr)) continue;
      resolvedIdSet.add(idStr);
      finalResolved.push(item);
    }

    // Cache the response in memory for 10 minutes
    if (finalResolved.length > 0) {
      recommendationsCache.set(cacheKey, {
        timestamp: Date.now(),
        recommendations: finalResolved,
      });
    }

    return NextResponse.json(
      { recommendations: finalResolved },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("[/api/recommend] Uncaught route handler error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate recommendations";
    return NextResponse.json(
      { error: message, recommendations: [] },
      { status: 500 }
    );
  }
}
