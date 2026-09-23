# Driftcast — Vercel deploy

## What's in here
- `index.html` — the whole app (UI, audio synthesis, playback logic)
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
