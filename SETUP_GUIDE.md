# GHO Expenses — Setup Guide

This gets the app from "code on a laptop" to "a real link your team can use." It's written for a first-time setup — follow it top to bottom, in order. Total time: about 30–45 minutes, mostly waiting for accounts to verify.

**Prefer the guided version?** Open `setup-wizard.html` in a browser — it walks through the same steps with live links and a one-click Vercel deploy button, and is kept up to date with the current Supabase/Vercel UIs. This document is the plain-text reference.

You'll create three free accounts along the way: **Supabase** (database + file storage + login), **OpenRouter** (voice transcription + receipt reading + categorization — one key covers all AI features), plus **Vercel** to host the app itself. **Telegram** (the chat bot) is optional and can be added any time after the app is live. None of these need a credit card to start (OpenRouter needs a small credit top-up before its AI calls will work — see step 3).

---

## 1. Create your Supabase project (database, file storage, and login)

1. Go to [supabase.com](https://supabase.com) → **Start your project** → sign in with GitHub or email.
2. Click **New project**. Pick any name (e.g. `gho-expenses`), set a database password (save it somewhere — you'll need it in step 1.4), pick the region closest to India (e.g. Singapore), and click **Create new project**. This takes ~2 minutes to provision.
3. Once it's ready, go to **Project Settings → API**. Copy three values into a notes file — you'll paste these into Vercel later:
   - **Project URL** → this is both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`
   - **anon public** key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (click "reveal") → this is `SUPABASE_SERVICE_ROLE_KEY`. Keep this one secret — never share it or put it in code.
4. Click the green **Connect** button near the top of the project page → **Shared pooler (session mode)** tab → copy the connection string. This is your `DATABASE_URL`. Replace the `[YOUR-PASSWORD]` placeholder in it with the database password from step 2. (Session mode is the one to use — it supports the prepared statements this app's automatic database setup relies on; Transaction mode and Direct connection can both cause problems here.)
5. Go to **Storage** in the left sidebar → **New bucket** → name it exactly `receipts` → toggle **Public bucket** on (this just means anyone with the exact file link can view it, not that it's listed publicly) → **Create bucket**.
6. Go to **Authentication → Providers** and confirm **Email** is enabled (it is by default). This is what lets you sign into the dashboard with a magic link — no password to remember.

## 2. Get an OpenRouter API key (voice transcription + receipt reading + categorization)

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys) → sign in → **Create Key**.
2. Copy it — this is `OPENROUTER_API_KEY`. This single key powers all the app's AI features: transcribing voice notes, reading receipt photos, and categorizing entries.
3. Go to **Settings → Credits** and add a small amount (₹400 / $5 is plenty to start — at your expected volume this should last months). This is the only step in the whole setup that costs real money, and the app's built-in budget cap (see step 8) stops it from running away.
4. (Optional) `OPENROUTER_TEXT_MODEL`, `OPENROUTER_VISION_MODEL`, and `OPENROUTER_TRANSCRIBE_MODEL` in `.env.example` each have a sensible default — you don't need to change them, but you can swap in any model OpenRouter offers later without touching code.

## 3. Put the code on GitHub

1. If you don't already have a GitHub account, make one at [github.com](https://github.com).
2. Create a new empty repository (e.g. `gho-expenses`).
3. From the project folder on your computer, run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/gho-expenses.git
   git push -u origin main
   ```

## 4. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → select your `gho-expenses` repo → **Import**.
2. Before clicking Deploy, open **Environment Variables** and add every value from `.env.example` with the real values you collected in steps 1–2:
   - `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_RECEIPTS_BUCKET` (`receipts`)
   - `OPENROUTER_API_KEY`, `OPENROUTER_TEXT_MODEL`, `OPENROUTER_VISION_MODEL`, `OPENROUTER_TRANSCRIBE_MODEL`
   - `MONTHLY_AI_BUDGET_USD` (start with `5`)
   - Leave `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `ADMIN_TELEGRAM_IDS` out entirely for now — they're only needed if you add the optional Telegram bot later (step 6).
3. Click **Deploy**. Takes 1–2 minutes. You'll get a URL like `https://gho-expenses.vercel.app`. The database tables and default expense categories (Raw Materials, Transport, Fuel, Staff/Labour, etc.) are created automatically as part of this deploy — no separate command to run.

## 5. Try it

1. Open `https://<your-app>.vercel.app/login` in a browser, enter your email, and click the magic link it sends you. This opens the dashboard.
2. Open `https://<your-app>.vercel.app/capture` on your phone — this is the universal capture page (voice, photo, or text — voice transcription works immediately, since it uses the same `OPENROUTER_API_KEY` you already set). Consider adding it to your home screen (your phone's browser menu → "Add to Home Screen") so it opens like a real app.
3. **The first person to use the capture page is automatically made the admin** — so do this yourself, first, before sharing the link with anyone else.

## 6. (Optional) Add the Telegram bot

The app works fully without this — it's only for letting your team log expenses by chatting with a bot instead of opening the capture page. Add it any time:

1. Open Telegram, search for **@BotFather**, and start a chat with it.
2. Send `/newbot`, give it a name (e.g. "GHO Expenses") and a username ending in `bot` (e.g. `gho_expenses_bot`).
3. BotFather replies with a token like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`. Copy it — this is `TELEGRAM_BOT_TOKEN`.
4. Pick any random string yourself (e.g. mash your keyboard) for `TELEGRAM_WEBHOOK_SECRET` — this just stops random people from pretending to be Telegram and sending fake messages to your app.
5. In Vercel: **Settings → Environment Variables**, add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`, then go to the **Deployments** tab and **Redeploy** the latest deployment so the new variables take effect.
6. Run this once (replace the placeholders), from any terminal:
   ```
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-app>.vercel.app/api/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
   You should get back `{"ok":true,"result":true,...}`.
7. Open Telegram, find your bot, and send `/start`, then try a text message like `450 diesel`. **The very first person to message the bot is automatically made an admin too** (if the capture page hasn't already made someone the admin).

## 7. Approve your team

Anyone who messages the bot or uses the capture page for the first time starts out **pending** — their entries are recorded but flagged, so a leaked link can't quietly pollute your books. To approve someone:
- **In Telegram** (as admin, if you set up the bot): send `/pending` to see who's waiting, then `/approve <their id>`.
- **In the dashboard**: open the **Team** tab and click **Approve** next to their name.

## 8. What's deliberately left for later

- **GST tracking** — you asked to skip this for now. When you want it, the AI extraction prompt in `lib/ai.ts` needs one more field (GST amount) and the dashboard/export need a column for it. Flag it and it's a small addition.
- **Email and SMS capture** — Telegram and the web capture page cover voice/photo/text today. Adding email means signing up for an inbound-email service (e.g. Mailgun's free tier) and forwarding it to a new `/api/email` route; SMS means a Twilio number. Both would reuse the same `processCapture()` pipeline — the hard part (AI extraction, categorization, project logic) is already channel-agnostic.
- **Supabase free tier pausing** — Supabase pauses a free project after 7 days with zero database activity. The daily cron job at `/api/health` (already configured in `vercel.json`) pings the database every day specifically to prevent this — you shouldn't need to do anything, but if the app ever feels slow on first load after a long quiet period, that's Supabase waking back up (takes a few seconds).
- **Raising the AI budget** — if `MONTHLY_AI_BUDGET_USD` is hit, the app will tell whoever's using it that processing is paused, and stop making AI calls until the next calendar month or until you raise the number in Vercel's environment variables and redeploy.
