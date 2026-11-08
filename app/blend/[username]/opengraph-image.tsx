import { ImageResponse } from "next/og";
import { supabase, getServerUser } from "@/lib/supabase";
import { calculateMatchScore, type BlendMovie } from "@/lib/blend";
import { computeScore } from "@/lib/score";
import type { MovieNode } from "@/lib/graph";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

interface PublicMovieRow {
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

  // 1. Fetch friend profile
  const { data: friendProfile } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .ilike("username", username)
    .maybeSingle();

  // 2. Fetch logged-in viewer
  const viewer = await getServerUser();

  // Check friendship
  let isFriend = false;
  if (viewer && friendProfile && viewer.id !== friendProfile.id) {
    const { data: friendship } = await supabase
      .from("friendships")
      .select("id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${viewer.id},addressee_id.eq.${friendProfile.id}),and(requester_id.eq.${friendProfile.id},addressee_id.eq.${viewer.id})`
      )
      .maybeSingle();

    if (friendship) isFriend = true;
  }

  // Generic Card Fallback for non-friends or unauthenticated viewers
  if (!friendProfile || !viewer || !isFriend) {
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
          {/* Eclipse Solar Crescent */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "28px",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "24px",
                backgroundColor: "#FF5A4F",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: "6px",
              }}
            >
              <div
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "15px",
                  backgroundColor: "#0F0F12",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "44px",
                fontWeight: "bold",
                letterSpacing: "-1px",
              }}
            >
              Eclipse Movie Blend
            </span>
          </div>

          <span
            style={{
              fontSize: "22px",
              color: "#8B8B95",
              maxWidth: "600px",
              textAlign: "center",
              lineHeight: "1.4",
            }}
          >
            Connect with friends on Eclipse to compare movie taste, calculate match scores, and blend your movie maps.
          </span>
        </div>
      ),
      { ...size }
    );
  }

  // 3. Authenticated friend view: fetch both users' movies
  const { data: viewerProf } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", viewer.id)
    .maybeSingle();

  const viewerName = viewerProf?.display_name || viewerProf?.username || "You";
  const friendName = friendProfile.display_name || friendProfile.username;

  async function fetchWatched(userId: string): Promise<{ blendMovies: BlendMovie[]; nodes: MovieNode[] }> {
    const { data } = await supabase
      .from("user_movies")
      .select(
        "tmdb_id, title, year, poster_path, genres, status, my_rating, watched_on, original_language"
      )
      .eq("user_id", userId)
      .eq("status", "watched")
      .order("added_at", { ascending: true });

    const rows = (data || []) as PublicMovieRow[];

    const blendMovies: BlendMovie[] = rows.map((row) => ({
      id: row.tmdb_id,
      title: row.title,
      year: row.year || "",
      posterPath: row.poster_path ?? null,
      genres: Array.isArray(row.genres) ? row.genres : [],
      myRating: row.my_rating ?? null,
    }));

    const nodes: MovieNode[] = rows.map((row) => ({
      id: row.tmdb_id,
      title: row.title,
      year: row.year || "",
      posterPath: row.poster_path ?? null,
      genres: Array.isArray(row.genres) ? row.genres : [],
      status: "watched" as const,
      addedAt: 0,
      watchedOn: row.watched_on ? String(row.watched_on) : "",
      overview: "",
      myRating: row.my_rating ?? null,
      myNote: null,
      originalLanguage: row.original_language || undefined,
    }));

    return { blendMovies, nodes };
  }

  const [viewerData, friendData] = await Promise.all([
    fetchWatched(viewer.id),
    fetchWatched(friendProfile.id),
  ]);

  const viewerMovies = viewerData.blendMovies;
  const friendMovies = friendData.blendMovies;

  const viewerScore = computeScore(viewerData.nodes);
  const friendScore = computeScore(friendData.nodes);

  const blend = calculateMatchScore(viewerMovies, friendMovies);

  // Take up to 6 shared posters (or fill with top movies if fewer)
  const displayMovies = blend.sharedMovies.slice(0, 6);
  if (displayMovies.length < 6) {
    for (const m of [...blend.onlyMine, ...blend.onlyTheirs]) {
      if (displayMovies.length >= 6) break;
      if (!displayMovies.some((d) => String(d.id) === String(m.id))) {
        displayMovies.push(m);
      }
    }
  }

  // Pre-fetch images to base64 Data URIs
  const posterBase64s: (string | null)[] = await Promise.all(
    displayMovies.map(async (m) => {
      if (!m.posterPath) return null;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`https://image.tmdb.org/t/p/w185${m.posterPath}`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const b64 = Buffer.from(buf).toString("base64");
        return `data:image/jpeg;base64,${b64}`;
      } catch {
        return null;
      }
    })
  );

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
        {/* Top Header: Users + Eclipse Wordmark */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          {/* Users Header */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span
              style={{
                fontSize: "36px",
                fontWeight: "bold",
                color: "#F2F2F3",
                letterSpacing: "-0.5px",
                lineHeight: "1.1",
              }}
            >
              {viewerName} × {friendName}
            </span>
            <span style={{ fontSize: "19px", color: "#8B8B95" }}>
              @{viewerProf?.username || "you"} & @{friendProfile.username}
            </span>

            {/* Cinema Scores */}
            <div style={{ display: "flex", flexDirection: "row", gap: "10px", marginTop: "4px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  borderRadius: "14px",
                  backgroundColor: "#38BDF820",
                  border: "1px solid #38BDF850",
                  fontSize: "13px",
                  color: "#38BDF8",
                  fontWeight: "bold",
                }}
              >
                <span>You: {viewerScore.level.name} · {viewerScore.total} pts</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 12px",
                  borderRadius: "14px",
                  backgroundColor: "#34D39920",
                  border: "1px solid #34D39950",
                  fontSize: "13px",
                  color: "#34D399",
                  fontWeight: "bold",
                }}
              >
                <span>@{friendProfile.username}: {friendScore.level.name} · {friendScore.total} pts</span>
              </div>
            </div>
          </div>

          {/* Eclipse Wordmark */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "12px",
              padding: "10px 18px",
              borderRadius: "20px",
              backgroundColor: "#17171C",
              border: "1px solid #26262D",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "14px",
                backgroundColor: "#FF5A4F",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: "4px",
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
                Movie Blend
              </span>
            </div>
          </div>
        </div>

        {/* Middle Stats Card: Match % & Counts */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 28px",
            backgroundColor: "#17171C",
            border: "1px solid #26262D",
            borderRadius: "20px",
            marginTop: "12px",
          }}
        >
          {/* Match Score Display */}
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <span
              style={{
                fontSize: "56px",
                fontWeight: "900",
                color: "#FF5A4F",
                letterSpacing: "-1.5px",
                lineHeight: "1",
              }}
            >
              {blend.matchScore}%
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span
                style={{
                  fontSize: "22px",
                  fontWeight: "bold",
                  color: "#F2F2F3",
                }}
              >
                {blend.matchLabel}
              </span>
              <span style={{ fontSize: "13px", color: "#8B8B95" }}>
                Taste Compatibility Match
              </span>
            </div>
          </div>

          {/* Counts Pills */}
          <div style={{ display: "flex", flexDirection: "row", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "16px",
                backgroundColor: "#0F0F12",
                border: "1px solid #26262D",
                fontSize: "14px",
                fontWeight: "bold",
                color: "#F2F2F3",
              }}
            >
              <span style={{ color: "#FF5A4F" }}>●</span>
              <span>{blend.sharedMovies.length} Shared</span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "16px",
                backgroundColor: "#0F0F12",
                border: "1px solid #26262D",
                fontSize: "14px",
                fontWeight: "bold",
                color: "#F2F2F3",
              }}
            >
              <span style={{ color: "#38BDF8" }}>●</span>
              <span>{blend.onlyMine.length} You</span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "16px",
                backgroundColor: "#0F0F12",
                border: "1px solid #26262D",
                fontSize: "14px",
                fontWeight: "bold",
                color: "#F2F2F3",
              }}
            >
              <span style={{ color: "#34D399" }}>●</span>
              <span>{blend.onlyTheirs.length} Them</span>
            </div>
          </div>
        </div>

        {/* Bottom Strip: 6 Shared / Blended Movie Posters along Metro Line */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "20px 28px",
            backgroundColor: "#17171C",
            border: "1px solid #26262D",
            borderRadius: "20px",
            height: "220px",
            position: "relative",
          }}
        >
          {/* Coral Metro Rail */}
          <div
            style={{
              position: "absolute",
              left: "40px",
              right: "40px",
              top: "110px",
              height: "4px",
              backgroundColor: "#FF5A4F",
              borderRadius: "2px",
              opacity: 0.8,
            }}
          />

          {/* 6 Posters */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              zIndex: 2,
            }}
          >
            {displayMovies.length === 0 ? (
              <div style={{ display: "flex", color: "#8B8B95", fontSize: "14px" }}>
                Add movies to your maps to see your shared poster collection!
              </div>
            ) : (
              displayMovies.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: "110px",
                  }}
                >
                  {/* Station interchange circle on rail */}
                  <div
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "7px",
                      backgroundColor: "#FFFFFF",
                      border: "3px solid #FF5A4F",
                      marginBottom: "6px",
                    }}
                  />

                  {/* Poster Thumbnail */}
                  <div
                    style={{
                      width: "80px",
                      height: "118px",
                      borderRadius: "8px",
                      border: "2px solid #FF5A4F",
                      overflow: "hidden",
                      backgroundColor: "#0F0F12",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {posterBase64s[idx] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={posterBase64s[idx]!}
                        alt={m.title}
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
                          padding: "6px",
                          textAlign: "center",
                          fontSize: "10px",
                          color: "#F2F2F3",
                          fontWeight: "bold",
                        }}
                      >
                        {m.title.slice(0, 14)}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

