# Demo backend

The five Edge entrypoints use the shared v1 request schemas. Browser mutations verify the supplied JWT with `auth.getUser`; adapter operations hash and resolve the scoped device token. `public.demo_api` is a service-role-only, security-invoker transactional boundary. It rechecks membership, device approval, privacy, and quota for each operation. No source text or credentials are logged.

`APP_ORIGIN` is a comma-separated allowlist of web origins. Its first entry supplies pairing approval URLs. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside Edge Functions; never put the service key in public web variables.

Jev uses `JEV_API_KEY`, optional `JEV_BASE_URL` (default `https://api.typesafe.ai`), and optional `JEV_MODEL` (default `jev-latest`). It calls the documented `/v1/systemone` endpoint with typed Choice questions, at most eight recent same-repository teammate sessions, and a 6.5-second deadline. Provider failure remains unavailable. Returned references and warning text are assembled from authorized database evidence, not invented by the model. Privacy/membership and source existence are checked again when storing the result.

The generated `contracts.js` must follow any core contract edit:

```sh
node supabase/functions/_shared/build-contracts.mjs
npx --yes deno@2.9.6 check --config supabase/functions/deno.json supabase/functions/{teams,devices,sharing,ingest,overlap-check}/index.ts
npx --yes deno@2.9.6 test --config supabase/functions/deno.json supabase/functions/_shared/{privacy,jev}.test.ts
```

Apply migrations before deploying. From the repository root, deploy each function with the explicit shared import map:

```sh
npx --yes supabase@2.119.0 functions deploy teams --use-api --import-map supabase/functions/deno.json --project-ref YOUR_PROJECT_REF
# Repeat for devices, sharing, ingest, and overlap-check.
```

`verify_jwt = false` in config is intentional: the handler verifies user JWTs itself, while device and pairing requests use their own credentials. This is not an unauthenticated mutation API.

Database checks: `supabase/tests/database/v1_access.test.sql`, `real_demo.test.sql`, and `billing_access.test.sql`. These roll back synthetic records. They test database behavior; the provider-mocked Deno checks do not establish live Jev, browser, or hosted deployment success.

For this small demo, short database mutations share an advisory lock, making revocation, privacy changes, quotas, and ingestion serializable relative to each other. Browser reconnects should reread the visible event window, not rely on an exclusive `ingest_id` cursor. The 50 MB per-person accounting includes conservative row/index overhead; cleanup begins at 40 MB and targets 30 MB. Fresh database size warns at 350 MB and pauses uploads at 400 MB. These are demo safeguards, not a substitute for monitoring all other project data.
