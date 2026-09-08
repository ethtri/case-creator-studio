-- Production recorded the idempotent checkout schema repair under this version
-- during the P0 recovery. The canonical repair SQL remains in migration
-- 20260908141849; this no-op marker reconciles local and remote history so
-- subsequent migrations can use the standard deployment path.
SELECT 1;
