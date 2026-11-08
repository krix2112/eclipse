import type { MovieNode } from "@/lib/graph";

export interface ScoreBreakdownCategory {
  id: string;
  label: string;
  points: number;
  maxPoints?: number;
  detail: string;
}

export interface ScoreLevelInfo {
  name: string;
  minPoints: number;
  nextLevelName: string | null;
  nextLevelPoints: number | null;
  progressPercent: number;
  pointsToNext: number;
}

export interface BadgeInfo {
  id: string;
  name: string;
  description: string;
  iconName: string;
  earned: boolean;
  progress: string;
}

export interface CinemaScoreResult {
  total: number;
  level: ScoreLevelInfo;
  nextLevel: ScoreLevelInfo | null;
  progress: number;
  breakdown: ScoreBreakdownCategory[];
  badges: BadgeInfo[];
  topBadges: BadgeInfo[];
}

export const LEVELS = [
  { name: "Newcomer", minPoints: 0 },
  { name: "Regular", minPoints: 150 },
  { name: "Film Buff", minPoints: 400 },
  { name: "Cinephile", minPoints: 900 },
  { name: "Auteur", minPoints: 1800 },
  { name: "Legend", minPoints: 3500 },
] as const;

/**
 * Pure function that calculates the Cinema Score, Level, Progress,
 * Category Subtotals Breakdown, and Badges from a user's watched movies.
 */
export function computeScore(watchedMovies: MovieNode[]): CinemaScoreResult {
  const movies = watchedMovies.filter((m) => m.status !== "recommended");

  // 1. Movie Count: +10 per watched movie, capped at 5 per calendar day
  const moviesByDay = new Map<string, number>();
  movies.forEach((m) => {
    let day = m.watchedOn ? String(m.watchedOn).slice(0, 10) : "";
    if (!day || day.length < 10) {
      day = m.addedAt ? new Date(m.addedAt).toISOString().slice(0, 10) : "unknown";
    }
    moviesByDay.set(day, (moviesByDay.get(day) || 0) + 1);
  });

  let countedDailyMovies = 0;
  moviesByDay.forEach((count) => {
    countedDailyMovies += Math.min(count, 5);
  });
  const moviePoints = countedDailyMovies * 10;

  // 2. Genres Explored: +15 for each new genre, up to 20 genres (max 300)
  const uniqueGenres = new Set<string>();
  movies.forEach((m) => {
    (m.genres || []).forEach((g) => {
      if (g?.name) uniqueGenres.add(g.name.trim());
    });
  });
  const cappedGenres = Math.min(uniqueGenres.size, 20);
  const genrePoints = cappedGenres * 15;

  // 3. Interchange Movies (belongs to 2+ genres): +10 each, up to 30 (max 300)
  const interchangeCount = movies.filter(
    (m) => (m.genres || []).length >= 2
  ).length;
  const cappedInterchanges = Math.min(interchangeCount, 30);
  const interchangePoints = cappedInterchanges * 10;

  // 4. Decades Explored: +20 per decade, up to 10 decades (max 200)
  const uniqueDecades = new Set<string>();
  movies.forEach((m) => {
    if (m.decade && m.decade !== "Unknown era") {
      uniqueDecades.add(m.decade);
    } else if (m.year) {
      const yr = parseInt(m.year, 10);
      if (!isNaN(yr) && yr > 1880) {
        uniqueDecades.add(`${Math.floor(yr / 10) * 10}s`);
      }
    }
  });
  const cappedDecades = Math.min(uniqueDecades.size, 10);
  const decadePoints = cappedDecades * 20;

  // 5. Non-English Cinema: +15 per non-English movie, up to 40 (max 600)
  const nonEnglishCount = movies.filter((m) => {
    const lang = m.originalLanguage?.toLowerCase();
    return Boolean(lang && lang !== "en");
  }).length;
  const cappedNonEnglish = Math.min(nonEnglishCount, 40);
  const languagePoints = cappedNonEnglish * 15;

  // 6. Classic Cinema (Released before 1990): +10 each, up to 20 (max 200)
  const pre1990Count = movies.filter((m) => {
    const yr = parseInt(m.year || "", 10);
    return !isNaN(yr) && yr > 0 && yr < 1990;
  }).length;
  const cappedPre1990 = Math.min(pre1990Count, 20);
  const classicPoints = cappedPre1990 * 10;

  // 7. Personal Star Ratings: +5 per movie with a rating, up to 50 (max 250)
  const ratedCount = movies.filter(
    (m) => typeof m.myRating === "number" && m.myRating > 0
  ).length;
  const cappedRated = Math.min(ratedCount, 50);
  const ratingPoints = cappedRated * 5;

  // 8. 7-day Watching Streak: +100 once (max 100)
  const validDates = Array.from(
    new Set(
      movies
        .map((m) => (m.watchedOn ? String(m.watchedOn).slice(0, 10) : ""))
        .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    )
  ).sort();

  let hasStreak = false;
  if (validDates.length >= 7) {
    let streakCount = 1;
    for (let i = 1; i < validDates.length; i++) {
      const prev = new Date(validDates[i - 1]).getTime();
      const curr = new Date(validDates[i]).getTime();
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streakCount++;
        if (streakCount >= 7) {
          hasStreak = true;
          break;
        }
      } else {
        streakCount = 1;
      }
    }
  }
  const streakPoints = hasStreak ? 100 : 0;

  // Total Score
  const total =
    moviePoints +
    genrePoints +
    interchangePoints +
    decadePoints +
    languagePoints +
    classicPoints +
    ratingPoints +
    streakPoints;

  // Level Computation
  let currentLevelIdx = 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (total >= LEVELS[i].minPoints) {
      currentLevelIdx = i;
      break;
    }
  }

  const currentLevelConfig = LEVELS[currentLevelIdx];
  const nextLevelConfig =
    currentLevelIdx < LEVELS.length - 1 ? LEVELS[currentLevelIdx + 1] : null;

  let progressPercent = 100;
  let pointsToNext = 0;

  if (nextLevelConfig) {
    const range = nextLevelConfig.minPoints - currentLevelConfig.minPoints;
    const currentProgress = total - currentLevelConfig.minPoints;
    progressPercent = Math.max(0, Math.min(100, Math.floor((currentProgress / range) * 100)));
    pointsToNext = Math.max(0, nextLevelConfig.minPoints - total);
  }

  const levelInfo: ScoreLevelInfo = {
    name: currentLevelConfig.name,
    minPoints: currentLevelConfig.minPoints,
    nextLevelName: nextLevelConfig ? nextLevelConfig.name : null,
    nextLevelPoints: nextLevelConfig ? nextLevelConfig.minPoints : null,
    progressPercent,
    pointsToNext,
  };

  const nextLevelInfo = nextLevelConfig
    ? {
        name: nextLevelConfig.name,
        minPoints: nextLevelConfig.minPoints,
        nextLevelName: null,
        nextLevelPoints: null,
        progressPercent: 0,
        pointsToNext: 0,
      }
    : null;

  // Category Breakdown Subtotals
  const breakdown: ScoreBreakdownCategory[] = [
    {
      id: "movies",
      label: "Movies Watched",
      points: moviePoints,
      detail: `${countedDailyMovies} movie${countedDailyMovies === 1 ? "" : "s"} counted (+10 each, cap 5/day)`,
    },
    {
      id: "genres",
      label: "Genres Explored",
      points: genrePoints,
      maxPoints: 300,
      detail: `${cappedGenres}/20 genres explored (+15 each)`,
    },
    {
      id: "interchanges",
      label: "Genre Interchanges",
      points: interchangePoints,
      maxPoints: 300,
      detail: `${cappedInterchanges}/30 multi-genre movies (+10 each)`,
    },
    {
      id: "decades",
      label: "Decades Spanned",
      points: decadePoints,
      maxPoints: 200,
      detail: `${cappedDecades}/10 decades explored (+20 each)`,
    },
    {
      id: "languages",
      label: "World Cinema",
      points: languagePoints,
      maxPoints: 600,
      detail: `${cappedNonEnglish}/40 non-English films (+15 each)`,
    },
    {
      id: "classics",
      label: "Classic Era",
      points: classicPoints,
      maxPoints: 200,
      detail: `${cappedPre1990}/20 pre-1990 films (+10 each)`,
    },
    {
      id: "ratings",
      label: "Critical Reviews",
      points: ratingPoints,
      maxPoints: 250,
      detail: `${cappedRated}/50 films with star ratings (+5 each)`,
    },
    {
      id: "streak",
      label: "7-Day Streak",
      points: streakPoints,
      maxPoints: 100,
      detail: hasStreak ? "7 consecutive days of watching (+100)" : "Watch a film 7 days in a row (+100)",
    },
  ];

  // BADGES COMPUTATION
  // 1. First Reel (1 movie)
  const b1 = movies.length >= 1;
  // 2. Double Digits (10 movies)
  const b2 = movies.length >= 10;
  // 3. Quarter Century (25 movies)
  const b3 = movies.length >= 25;
  // 4. Centurion (100 movies)
  const b4 = movies.length >= 100;

  // 5. Genre Hopper (8 genres)
  const b5 = uniqueGenres.size >= 8;
  // 6. Bridge Builder (5 interchanges)
  const b6 = interchangeCount >= 5;
  // 7. Time Traveler (5 decades)
  const b7 = uniqueDecades.size >= 5;

  // 8. Globetrotter (5 languages)
  const uniqueLanguages = new Set<string>();
  movies.forEach((m) => {
    if (m.originalLanguage) uniqueLanguages.add(m.originalLanguage.toLowerCase());
  });
  const b8 = uniqueLanguages.size >= 5;

  // 9. Old Soul (5 pre-1970 movies)
  const pre1970Count = movies.filter((m) => {
    const yr = parseInt(m.year || "", 10);
    return !isNaN(yr) && yr > 0 && yr < 1970;
  }).length;
  const b9 = pre1970Count >= 5;

  // 10. Critic (rate 20 movies)
  const b10 = ratedCount >= 20;

  // 11. Marathoner (10 movies in a single month by watched_on)
  const monthCounts = new Map<string, number>();
  movies.forEach((m) => {
    const month = m.watchedOn ? String(m.watchedOn).slice(0, 7) : "";
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    }
  });
  let maxInMonth = 0;
  monthCounts.forEach((c) => {
    if (c > maxInMonth) maxInMonth = c;
  });
  const b11 = maxInMonth >= 10;

  // 12. Completionist (a director with 5 movies in the map)
  const directorCounts = new Map<string, number>();
  movies.forEach((m) => {
    if (m.director && m.director !== "Unknown Director") {
      directorCounts.set(m.director, (directorCounts.get(m.director) || 0) + 1);
    }
  });
  let maxDirectorCount = 0;
  directorCounts.forEach((c) => {
    if (c > maxDirectorCount) maxDirectorCount = c;
  });
  const b12 = maxDirectorCount >= 5;

  const badges: BadgeInfo[] = [
    {
      id: "first_reel",
      name: "First Reel",
      description: "Watch your first movie on Eclipse",
      iconName: "Film",
      earned: b1,
      progress: `${Math.min(movies.length, 1)}/1`,
    },
    {
      id: "double_digits",
      name: "Double Digits",
      description: "Watch 10 movies",
      iconName: "Award",
      earned: b2,
      progress: `${Math.min(movies.length, 10)}/10`,
    },
    {
      id: "quarter_century",
      name: "Quarter Century",
      description: "Watch 25 movies",
      iconName: "Sparkles",
      earned: b3,
      progress: `${Math.min(movies.length, 25)}/25`,
    },
    {
      id: "centurion",
      name: "Centurion",
      description: "Watch 100 movies",
      iconName: "Crown",
      earned: b4,
      progress: `${Math.min(movies.length, 100)}/100`,
    },
    {
      id: "genre_hopper",
      name: "Genre Hopper",
      description: "Explore at least 8 unique genres",
      iconName: "Layers",
      earned: b5,
      progress: `${Math.min(uniqueGenres.size, 8)}/8`,
    },
    {
      id: "bridge_builder",
      name: "Bridge Builder",
      description: "Add 5 multi-genre interchange movies",
      iconName: "GitMerge",
      earned: b6,
      progress: `${Math.min(interchangeCount, 5)}/5`,
    },
    {
      id: "time_traveler",
      name: "Time Traveler",
      description: "Explore films across 5 different decades",
      iconName: "Clock",
      earned: b7,
      progress: `${Math.min(uniqueDecades.size, 5)}/5`,
    },
    {
      id: "globetrotter",
      name: "Globetrotter",
      description: "Watch films in 5 different languages",
      iconName: "Globe",
      earned: b8,
      progress: `${Math.min(uniqueLanguages.size, 5)}/5`,
    },
    {
      id: "old_soul",
      name: "Old Soul",
      description: "Watch 5 classic films released before 1970",
      iconName: "Hourglass",
      earned: b9,
      progress: `${Math.min(pre1970Count, 5)}/5`,
    },
    {
      id: "critic",
      name: "Critic",
      description: "Give personal star ratings to 20 movies",
      iconName: "Star",
      earned: b10,
      progress: `${Math.min(ratedCount, 20)}/20`,
    },
    {
      id: "marathoner",
      name: "Marathoner",
      description: "Watch 10 movies in a single calendar month",
      iconName: "Flame",
      earned: b11,
      progress: `${Math.min(maxInMonth, 10)}/10`,
    },
    {
      id: "completionist",
      name: "Completionist",
      description: "Map 5 or more movies by the same director",
      iconName: "Video",
      earned: b12,
      progress: `${Math.min(maxDirectorCount, 5)}/5`,
    },
  ];

  // Top 3 earned badges (or first badges if fewer earned)
  const earnedBadges = badges.filter((b) => b.earned);
  const topBadges = earnedBadges.slice(-3).reverse();

  return {
    total,
    level: levelInfo,
    nextLevel: nextLevelInfo,
    progress: progressPercent,
    breakdown,
    badges,
    topBadges,
  };
}

