-- Run this in Hostinger's phpMyAdmin (Databases → your DB → phpMyAdmin → SQL tab)
-- One table: notes (id, note, lng, lat, created_at)

CREATE TABLE IF NOT EXISTS notes (
  id VARCHAR(64) PRIMARY KEY,
  note TEXT NOT NULL,
  lng DOUBLE NOT NULL,
  lat DOUBLE NOT NULL,
  created_at INT UNSIGNED NOT NULL,
  INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
