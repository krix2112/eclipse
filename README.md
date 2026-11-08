# Eclipse — Your Movie Taste, Mapped

Eclipse maps your movie universe as an interactive metro transit map. Discover connections through genres, directors, cast, and decades, unlock AI-powered recommendations with Groq & Gemini, track your derived Cinema Score, and blend movie maps with friends.

---

## Features

- **Metro Map Visualization**: Interactive transit map with subway lines representing genres, eras, directors, and actors, featuring interchange transfer stations for multi-genre films.
- **Dual AI Recommendations**: Parallel recommendation engine combining **Groq** (LLaMA 3.3 for similar picks) and **Google Gemini** (Gemini 2.0 Flash for stretch picks), deduplicated and resolved via TMDB.
- **Derived Cinema Score**: Pure algorithmic score and progression system (Levels: *Newcomer*, *Regular*, *Film Buff*, *Cinephile*, *Auteur*, *Legend*) with 12 unlockable badges and detailed point breakdowns—100% computed on the fly with no score column.
- **Social Profiles & Share Cards**: Public `@username` profiles with read-only interactive maps, stats, dynamic OpenGraph preview cards, and one-click image downloads.
- **Movie Blend**: Connect with friends to compare taste, compute compatibility percentages, explore shared films, and get "Watch Together" AI picks.
- **Community Leaderboard**: Real-time ranking of you and your friends with podium badges and an "All time" vs "This month" toggle.
- **Expanded Movie Detail Slide-Over**: Integrated TMDB and OMDb data with Rotten Tomatoes %, IMDb ratings, Metacritic scores, streaming provider links, trailers, and personal 5-star ratings with private notes.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (Strict Mode)
- **Styling**: Tailwind CSS (Neutral charcoal & warm coral design system)
- **Animations**: Framer Motion
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security, Auth)
- **AI Providers**: Groq API (`llama-3.3-70b-versatile`), Google Gemini API (`gemini-2.0-flash`)
- **Movie Metadata**: TMDB API v3, OMDb API
- **Visuals & Graphing**: Custom SVG/HTML Metro Map overlay + Canvas 2D Force Graph fallback

---

## Deploying to Vercel

### Step 1: Push Repository to GitHub
Ensure your repository is pushed to GitHub (e.g. `https://github.com/krix2112/eclipse`).

### Step 2: Import into Vercel
1. Go to [vercel.com](https://vercel.com/) and click **"Add New..."** &rarr; **"Project"**.
2. Select your `eclipse` repository.
3. Keep the default build settings:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: `next build` (or leave default)
   - **Output Directory**: `.next` (or leave default)

### Step 3: Configure Environment Variables in Vercel
Add the following variables in **Project Settings &rarr; Environment Variables**:

| Variable Name | Required | Description |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Your Supabase project URL (`https://xyz.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Your Supabase public anonymous key |
| `TMDB_API_KEY` | **Yes** | TMDB API v3 Key for movie search and metadata |
| `GEMINI_API_KEY` | **Yes** | Google AI Studio API Key for stretch recommendations |
| `GROQ_API_KEY` | **Yes** | Groq API Key for parallel AI recommendations |
| `GROQ_MODEL` | No | Defaults to `llama-3.3-70b-versatile` |
| `GEMINI_MODELS` | No | Defaults to `gemini-2.0-flash` |
| `OMDB_API_KEY` | Recommended | OMDb API key for Rotten Tomatoes %, IMDb, Metacritic |

### Step 4: Supabase Setup & URL Configuration
1. Open your Supabase project dashboard at [supabase.com](https://supabase.com/).
2. Navigate to the **SQL Editor** and execute [`supabase/schema.sql`](./supabase/schema.sql) to set up the `profiles`, `user_movies`, and `friendships` tables along with Row Level Security (RLS) policies.
3. In Supabase **Authentication &rarr; URL Configuration**:
   - Set **Site URL** to your Vercel deployment URL (e.g., `https://eclipse-yourname.vercel.app`).
   - Add `https://eclipse-yourname.vercel.app/**` and `http://localhost:3000/**` to **Redirect URLs**.

---

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/krix2112/eclipse.git
   cd eclipse
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.local.example .env.local
   # Fill in your API keys in .env.local
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. Validate the build:
   ```bash
   npm run build
   ```
