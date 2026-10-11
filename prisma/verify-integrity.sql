-- Read-only catalog assertions to run AFTER the initial migration is approved/applied.
-- Does not insert, update, or delete business records.
DO $$
DECLARE
    constraint_count integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') THEN
        RAISE EXCEPTION 'Missing btree_gist extension';
    END IF;

    SELECT count(*) INTO constraint_count
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND c.convalidated
      AND (
          (t.relname = 'Reservation' AND c.contype = 'c' AND c.conname IN (
              'Reservation_valid_time_interval_check',
              'Reservation_confirmed_resource_check'
          ))
          OR (t.relname = 'Resource' AND c.contype = 'c'
              AND c.conname = 'Resource_positive_capacity_check')
          OR (t.relname = 'Reservation' AND c.contype = 'x' AND c.conname IN (
              'Reservation_confirmed_resource_no_overlap',
              'Reservation_confirmed_driver_no_overlap'
          ))
      );

    IF constraint_count <> 5 THEN
        RAISE EXCEPTION 'Expected 5 validated custom constraints, found %', constraint_count;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        LEFT JOIN pg_index i ON i.indexrelid = c.conindid
        WHERE n.nspname = 'public' AND t.relname = 'Reservation'
          AND c.conname IN (
              'Reservation_confirmed_resource_no_overlap',
              'Reservation_confirmed_driver_no_overlap'
          )
          AND (i.indexrelid IS NULL OR NOT i.indisvalid OR NOT i.indisready)
    ) THEN
        RAISE EXCEPTION 'An exclusion constraint index is missing or invalid';
    END IF;
END $$;

-- For inspection through psql or a SQL client; Prisma db execute discards result rows.
SELECT t.relname AS table_name, c.conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND c.conname IN (
      'Reservation_valid_time_interval_check',
      'Reservation_confirmed_resource_check',
      'Resource_positive_capacity_check',
      'Reservation_confirmed_resource_no_overlap',
      'Reservation_confirmed_driver_no_overlap'
  )
ORDER BY t.relname, c.conname;
