# Ringster staging

Staging site: `https://dev.ringster.ai` (separate Netlify site).
Staging Supabase project: `https://pjjdugmymtqoxyompiof.supabase.co`.

This application uses Vite. Supabase's suggested `NEXT_PUBLIC_` variable names
do not configure this app. Configure these on the staging Netlify site only:

```dotenv
VITE_SUPABASE_URL=https://pjjdugmymtqoxyompiof.supabase.co
VITE_SUPABASE_PROJECT_ID=pjjdugmymtqoxyompiof
VITE_SUPABASE_PUBLISHABLE_KEY=<staging public publishable key>
VITE_SUPABASE_ANON_KEY=<same staging public key, for older browser consumers>
VITE_RINGSTER_DEMO_ENABLED=false
SUPABASE_URL=https://pjjdugmymtqoxyompiof.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<staging service-role key, server only>
RINGSTER_DEMO_ENABLED=false
```

Leave `VITE_NETLIFY_URL` unset so browser function requests remain on the staging
site. Do not copy production credentials, payment/provider webhook settings,
or customer data to staging. Set browser variables for the build and server
variables for Functions. A local CLI deployment uses the locally built assets:
remote build settings do not rewrite an existing `dist` directory. Build with
`npx vite build --mode staging` and an ignored `.env.staging.local` file before
deploying that output to the verified staging site.

The browser client requires an explicit URL and public key. Missing settings
stop Vite before a bundle is emitted; there is no production default. Existing
production deployments must explicitly configure their own URL and public key
before adopting this change. Changing browser settings requires a rebuild.

## Remaining setup before a live demo

1. Confirm the separate Netlify site's ID/name and assign `dev.ringster.ai` to it.
   Do not use the production site's CLI link or production deploy command.
2. Configure staging Supabase Auth's site URL and allowed redirects for
   `https://dev.ringster.ai`. Create email-verified test accounts.
3. Review and apply the required schema to the staging project. The two demo
   migrations create the demo data model; the surrounding application also
   expects profiles, onboarding and other tables. Do not assume a blank project
   supports the entire dashboard or replay all legacy migrations blindly.
4. Add the staging server secrets and dedicated demo webhook configuration
   described in `demo-development.md`. Keep both demo flags off until ready.
5. Validate sign-in and confirm browser and Functions use this same staging
   project. Then enable the two demo flags and follow the live demo walkthrough.

No schema has been applied and no deployment is implied by these instructions.
