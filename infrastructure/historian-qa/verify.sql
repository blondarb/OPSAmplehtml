-- Synthetic-only post-initialization assertions. ON_ERROR_STOP makes any
-- raised exception fail the temporary initializer build.

DO $verify$
BEGIN
  IF to_regclass('public.historian_invites') IS NULL
     OR to_regclass('public.historian_eval_jobs') IS NULL
     OR (SELECT count(*) FROM public.patients WHERE tenant_id = 'historian-mvp-qa') <> 1
     OR (SELECT count(*) FROM public.neurology_consults WHERE tenant_id = 'historian-mvp-qa') <> 1
     OR (
       SELECT count(*)
         FROM public.clinical_access_memberships
        WHERE tenant_id = 'historian-mvp-qa' AND active
     ) <> 1
  THEN
    RAISE EXCEPTION 'Synthetic QA schema or seed verification failed.';
  END IF;
END
$verify$;

SELECT 'PASS synthetic QA schema and seed verified';
