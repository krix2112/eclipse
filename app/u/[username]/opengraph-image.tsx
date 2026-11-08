import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";
import { computeScore } from "@/lib/score";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const LINE_COLORS = ["#FF5A4F", "#38BDF8", "#34D399"];

interface MovieRow {
  tmdb_id: number;
  title: string;
  year?: string;
  poster_path?: string | null;
  genres?: { id: number; name: string }[] | null;
  status: string;
  my_rating?: number | null;
  watched_on?: string | null;
  original_language?: string | null;
}

export default async function Image({
  params,
}: {
  params: { username: string };
}) {
  const username = params.username?.toLowerCase();

  // 1. Fetch public profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, is_public")
    .ilike("username", username)
    .maybeSingle();

  // Fallback card if profile does not exist or is private
  if (!profile || !profile.is_public) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            backgroundColor: "#0F0F12",
            color: "#F2F2F3",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Inter, sans-serif",
            padding: "48px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "24px",
                backgroundColor: "#FF5A4F",
              }}
            />
            <span
              style={{
                fontSize: "42px",
                fontWeight: "bold",
                letterSpacing: "-1px",
              }}
            >
              Eclipse
            </span>
          </div>
          <span style={{ fontSize: "24px", color: "#8B8B95" }}>
            This movie map is private or does not exist.
          </span>
        </div>
      ),
      { ...size }
    );
  }

  const displayName = profile.display_name || profile.username;
  const avatarLetter = (displayName || "U").charAt(0).toUpperCase();

  // 2. Fetch watched movies
  // SECURITY: only select public columns
  const { data: moviesData } = await supabase
    .from("user_movies")
    .select(
      "tmdb_id, title, year, poster_path, genres, status, my_rating, watched_on, original_language"
    )
    .eq("user_id", profile.id)
    .eq("status", "watched")
    .order("added_at", { ascending: true });

  const allMovies: MovieRow[] = (moviesData as MovieRow[]) || [];
  const movies = allMovies.slice(0, 12);
  const movieCount = allMovies.length;

  const score = computeScore(
    allMovies.map((m) => ({
      id: m.tmdb_id,
      title: m.title,
      year: m.year || "",
      posterPath: m.poster_path ?? null,
      genres: Array.isArray(m.genres) ? m.genres : [],
      status: "watched" as const,
      addedAt: 0,
      watchedOn: m.watched_on ? String(m.watched_on) : "",
      overview: "",
      myRating: m.my_rating ?? null,
      myNote: null,
      originalLanguage: m.original_language || undefined,
    }))
  );

  // Extract unique genres
  const genreSet = new Set<string>();
  allMovies.forEach((m) => {
    if (Array.isArray(m.genres)) {
      m.genres.forEach((g) => {
        if (g?.name) genreSet.add(g.name);
      });
    }
  });
  const genreCount = genreSet.size;

  // Compute average rating
  const rated = allMovies.filter(
    (m) => typeof m.my_rating === "number" && m.my_rating > 0
  );
  const avgRating =
    rated.length > 0
      ? (
          rated.reduce((acc, m) => acc + (m.my_rating || 0), 0) / rated.length
        ).toFixed(1)
      : null;

  // Pre-fetch poster images into base64 Data URLs for guaranteed rendering
  const posterDataUris: (string | null)[] = await Promise.all(
    movies.map(async (m) => {
      if (!m.poster_path) return null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2200);
        const res = await fetch(
          `https://image.tmdb.org/t/p/w185${m.poster_path}`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString("base64");
        return `data:image/jpeg;base64,${base64}`;
      } catch {
        return null;
      }
    })
  );

  // Group movies into 2 or 3 lines
  const linesCount = movies.length > 6 ? 3 : 2;
  const itemsPerLine = Math.ceil(movies.length / linesCount) || 1;

  const lines: {
    name: string;
    color: string;
    items: { movie: MovieRow; poster: string | null }[];
  }[] = [];

  const genreNames = Array.from(genreSet);

  for (let i = 0; i < linesCount; i++) {
    const startIdx = i * itemsPerLine;
    const endIdx = startIdx + itemsPerLine;
    const slice = movies.slice(startIdx, endIdx);
    const lineItems = slice.map((m, idx) => ({
      movie: m,
      poster: posterDataUris[startIdx + idx] || null,
    }));

    const lineGenre =
      genreNames[i] ||
      (i === 0 ? "Line 1" : i === 1 ? "Line 2" : "Line 3");

    lines.push({
      name: lineGenre,
      color: LINE_COLORS[i % LINE_COLORS.length],
      items: lineItems,
    });
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#0F0F12",
          color: "#F2F2F3",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "Inter, sans-serif",
          padding: "44px 52px",
          border: "1px solid #26262D",
        }}
      >
        {/* Top Row: User identity + Eclipse wordmark */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          {/* User profile & stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "18px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "32px",
                  backgroundColor: "#17171C",
                  border: "2px solid #FF5A4F",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "30px",
                  fontWeight: "bold",
                  color: "#FF5A4F",
                }}
              >
                {avatarLetter}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: "34px",
                    fontWeight: "bold",
                    color: "#F2F2F3",
                    letterSpacing: "-0.5px",
                    lineHeight: "1.1",
                  }}
                >
                  {displayName}
                </span>
                <span style={{ fontSize: "19px", color: "#8B8B95", marginTop: "2px" }}>
                  @{profile.username}
                </span>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", flexDirection: "row", gap: "10px", marginTop: "4px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "16px",
                  backgroundColor: "#FF5A4F20",
                  border: "1px solid #FF5A4F60",
                  fontSize: "14px",
                  color: "#FF5A4F",
                  fontWeight: "bold",
                }}
              >
                <span>🏆</span>
                <span>{score.level.name} · {score.total} pts</span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "16px",
                  backgroundColor: "#17171C",
                  border: "1px solid #26262D",
                  fontSize: "14px",
                  color: "#F2F2F3",
                  fontWeight: "600",
                }}
              >
                <span style={{ color: "#FF5A4F" }}>●</span>
                <span>{movieCount} {movieCount === 1 ? "Movie" : "Movies"}</span>
              </div>

              {genreCount > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "16px",
                    backgroundColor: "#17171C",
                    border: "1px solid #26262D",
                    fontSize: "14px",
                    color: "#F2F2F3",
                    fontWeight: "600",
                  }}
                >
                  <span style={{ color: "#38BDF8" }}>●</span>
                  <span>{genreCount} Genres</span>
                </div>
              )}

              {avgRating && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 14px",
                    borderRadius: "16px",
                    backgroundColor: "#17171C",
                    border: "1px solid #26262D",
                    fontSize: "14px",
                    color: "#F2F2F3",
                    fontWeight: "600",
                  }}
                >
                  <span style={{ color: "#FBBF24" }}>★</span>
                  <span>{avgRating} Avg Rating</span>
                </div>
              )}
            </div>
          </div>

          {/* Eclipse wordmark in top right */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "14px",
              padding: "10px 18px",
              borderRadius: "20px",
              backgroundColor: "#17171C",
              border: "1px solid #26262D",
            }}
          >
            {/* Solar Eclipse Emblem */}
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "14px",
                backgroundColor: "#FF5A4F",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: "3px",
              }}
            >
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "9px",
                  backgroundColor: "#17171C",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "20px",
                  fontWeight: "bold",
                  color: "#F2F2F3",
                  letterSpacing: "-0.5px",
                  lineHeight: "1",
                }}
              >
                Eclipse
              </span>
              <span style={{ fontSize: "11px", color: "#8B8B95", marginTop: "2px" }}>
                Movie Taste, Mapped
              </span>
            </div>
          </div>
        </div>

        {/* Metro Map Strip: Up to 12 poster thumbnails along colored lines */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            backgroundColor: "#17171C",
            border: "1px solid #26262D",
            borderRadius: "20px",
            padding: "20px 28px",
            marginTop: "20px",
            height: "360px",
            width: "100%",
          }}
        >
          {lines.map((line, lIdx) => (
            <div
              key={lIdx}
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                position: "relative",
                width: "100%",
                height: "92px",
              }}
            >
              {/* Line badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100px",
                  height: "30px",
                  borderRadius: "15px",
                  backgroundColor: line.color,
                  color: "#0F0F12",
                  fontWeight: "bold",
                  fontSize: "12px",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  marginRight: "28px",
                  flexShrink: 0,
                }}
              >
                {line.name}
              </div>

              {/* Metro Rail behind nodes */}
              <div
                style={{
                  position: "absolute",
                  left: "128px",
                  right: "20px",
                  top: "44px",
                  height: "4px",
                  backgroundColor: line.color,
                  borderRadius: "2px",
                  opacity: 0.85,
                }}
              />

              {/* Station Posters */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "28px",
                  zIndex: 2,
                }}
              >
                {line.items.length === 0 ? (
                  <div style={{ display: "flex", color: "#8B8B95", fontSize: "12px", marginLeft: "12px" }}>
                    No movies mapped on this line yet
                  </div>
                ) : (
                  line.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        width: "60px",
                      }}
                    >
                      {/* Station interchange dot on rail */}
                      <div
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "6px",
                          backgroundColor: "#FFFFFF",
                          border: `3px solid ${line.color}`,
                          marginBottom: "4px",
                        }}
                      />

                      {/* Poster thumbnail or stylized card */}
                      <div
                        style={{
                          width: "56px",
                          height: "64px",
                          borderRadius: "6px",
                          border: `2px solid ${line.color}`,
                          overflow: "hidden",
                          backgroundColor: "#0F0F12",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {item.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.poster}
                            alt={item.movie.title}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              padding: "4px",
                              textAlign: "center",
                              fontSize: "9px",
                              color: "#F2F2F3",
                              fontWeight: "bold",
                            }}
                          >
                            {item.movie.title.slice(0, 10)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
