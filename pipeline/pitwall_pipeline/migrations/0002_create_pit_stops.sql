-- Pit stops. `pit_lane_time_seconds` measures pit-lane entry-to-exit time
-- (FastF1's PitOutTime - PitInTime), not stationary box time -- it includes
-- driving through the pit lane, not just the tyre change itself
-- (docs/m10-design-review.md §3.1).
--
-- Same composite-natural-key/no-cross-engine-FK rationale as stints (see
-- 0001_create_stints.sql and docs/adr/0011-hybrid-storage-architecture.md).
CREATE TABLE pit_stops (
    session_id             TEXT    NOT NULL,
    driver_id              TEXT    NOT NULL,
    stop_number            INT     NOT NULL,
    lap_number             INT     NOT NULL,
    pit_lane_time_seconds  FLOAT,
    PRIMARY KEY (session_id, driver_id, stop_number)
);
