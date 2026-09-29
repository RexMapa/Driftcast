# Driftcast — Vercel deploy

## What's in here
- `index.html` — page markup (nav, demo, how-it-works, pricing, footer)
- `assets/app.css`, `assets/app.js` — styles, audio synthesis, playback logic (external files so the CSP can block inline scripts)
- `vercel.json` — security headers (CSP, HSTS, no-framing, etc.)
- `api/generate.js` — a serverless function that calls the Anthropic API server-side
- No build step, no framework — this deploys as-is.

## Deploy steps

1. Push this folder to a GitHub repo (or drag-and-drop deploy via the Vercel dashboard).
2. In Vercel: **New Project** → import the repo → Framework Preset: **Other** → Deploy.
3. Before (or right after) the first deploy, add an environment variable:
   - Go to **Project Settings → Environment Variables**
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from https://console.anthropic.com/settings/keys
   - Apply to Production (and Preview if you want previews to work too)
4. Redeploy if you added the key after the first deploy (env vars only apply to new deployments).

## Notes
- The API key stays server-side in `api/generate.js` — it's never sent to the browser.
- The `/api/generate` function uses the `claude-sonnet-4-6` model and returns `{ text }`. Adjust the model name in `api/generate.js` if you want a different one.
- Ambient sound (rain / brown noise / fireplace) and the text-to-speech narration playback run entirely in the browser and need no API key or server calls.
- If the API call fails for any reason (missing key, rate limit, network issue), the app falls back to static placeholder text so it never breaks — check your Vercel function logs if you keep seeing the fallback.

## Security
- **No open proxy:** the browser sends only `{action:"curate"|"narrate", ...}`; prompts are built server-side, inputs are length-limited and stripped, and output is validated (source whitelist, clamped minutes). `max_tokens` is capped per action.
- **Origin check:** requests must come from your own deployment. Add other domains (custom domain, previews) with `ALLOWED_ORIGINS=https://a.com,https://b.com`.
- **Rate limiting:** 20 requests / 10 min / IP (`RATE_LIMIT_MAX` to change). The default in-memory limiter is per serverless instance, so it is best-effort. For a shared, reliable limit add a free Upstash Redis and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
- **XSS:** all model output is HTML-escaped before rendering, and the CSP blocks inline/third-party scripts.
- **Honest limits:** an origin check stops other websites and casual abuse, not a determined person spoofing headers from a script. Rate limiting plus the token caps are what bound your costs. For hard protection add user accounts (e.g. Vercel Authentication or Auth.js), and set a monthly spend limit in the Anthropic console.
