-- Stints: a contiguous run of laps one driver spends on one tyre set.
-- See docs/m10-design-review.md §3.2 and docs/adr/0011-hybrid-storage-architecture.md.
--
-- Composite natural key (not a surrogate id) so ingestion can upsert
-- (ON CONFLICT DO UPDATE) instead of accumulating duplicates on re-ingestion
-- (Phase 2). session_id/driver_id are plain TEXT matching the identifier
-- scheme Parquet already uses -- no foreign key back to Parquet, since
-- Postgres has no way to reference a file on disk (ADR-0011).
CREATE TABLE stints (
    session_id          TEXT    NOT NULL,
    driver_id           TEXT    NOT NULL,
    stint_number        INT     NOT NULL,
    compound            TEXT    NOT NULL,
    start_lap           INT     NOT NULL,
    end_lap             INT     NOT NULL,
    tyre_life_at_start  INT,
    PRIMARY KEY (session_id, driver_id, stint_number)
);
