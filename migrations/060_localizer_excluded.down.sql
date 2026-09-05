-- Down migration for 060_localizer_excluded.
ALTER TABLE neurology_consults DROP COLUMN IF EXISTS localizer_excluded;
