# Talentry

Deployment target: Railway + a new Supabase project.

## Required frontend variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Required Supabase Edge Function secrets
- `OPENAI_API_KEY` or `OPENROUTER_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Notes
- Lovable-specific dependencies and AI gateway references were removed.
- Update `supabase/config.toml` with your new project ref before deploying functions.
