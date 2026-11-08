-- Migration: Add watched_on column to user_movies table
-- Description: Stores the date or year when the user watched the movie.

ALTER TABLE user_movies ADD COLUMN IF NOT EXISTS watched_on DATE;

