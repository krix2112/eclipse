-- ==============================================================================
-- ECLIPSE SUPABASE DATABASE SCHEMA
-- Execute in your Supabase project's SQL Editor (Dashboard -> SQL Editor)
-- ==============================================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (is_public = true OR auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 2. USER_MOVIES TABLE
CREATE TABLE IF NOT EXISTS user_movies (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  year TEXT,
  poster_path TEXT,
  genres JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'watched',
  overview TEXT,
  reason TEXT,
  connects_to_id BIGINT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  my_rating NUMERIC(3, 1),
  my_note TEXT,
  watched_on DATE,
  original_language TEXT,
  CONSTRAINT unique_user_tmdb UNIQUE (user_id, tmdb_id)
);

-- Migrations / Columns if table already exists
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS watched_on DATE;
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS original_language TEXT;
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS my_rating NUMERIC(3, 1);
ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS my_note TEXT;

-- Enable RLS on user_movies
ALTER TABLE user_movies ENABLE ROW LEVEL SECURITY;

-- User Movies Policies
CREATE POLICY "Users can manage their own movies"
  ON user_movies FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public watched movies viewable by public"
  ON user_movies FOR SELECT
  USING (
    status = 'watched' AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = user_movies.user_id AND profiles.is_public = true
    )
  );

CREATE POLICY "Friends can view watched movies"
  ON user_movies FOR SELECT
  USING (
    status = 'watched' AND (
      EXISTS (
        SELECT 1 FROM friendships
        WHERE friendships.status = 'accepted'
          AND (
            (friendships.requester_id = auth.uid() AND friendships.addressee_id = user_movies.user_id)
            OR (friendships.addressee_id = auth.uid() AND friendships.requester_id = user_movies.user_id)
          )
      )
    )
  );

-- 3. FRIENDSHIPS TABLE
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'declined'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_friendship UNIQUE (requester_id, addressee_id),
  CONSTRAINT no_self_friendship CHECK (requester_id <> addressee_id)
);

-- Enable RLS on friendships
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Friendships Policies
CREATE POLICY "Users can view friendships they are involved in"
  ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Users can create friendship requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update their friendship status"
  ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id OR auth.uid() = requester_id);

CREATE POLICY "Users can delete their friendships"
  ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

