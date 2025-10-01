CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS review_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  kind        TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id    UUID        NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
  ext_id       TEXT        NOT NULL,
  author       TEXT,
  title        TEXT,
  body         TEXT,
  rating       NUMERIC(3,1),
  created_at   TIMESTAMPTZ NOT NULL,
  harvested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  url          TEXT,
  lang         TEXT,
  product      TEXT,
  tags         JSONB
);

ALTER TABLE reviews
  ADD CONSTRAINT reviews_source_ext_unique UNIQUE (source_id, ext_id);

CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_rating     ON reviews (rating);
CREATE INDEX IF NOT EXISTS idx_reviews_product    ON reviews (product);
CREATE INDEX IF NOT EXISTS idx_reviews_source_id  ON reviews (source_id);
