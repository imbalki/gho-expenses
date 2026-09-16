# GHO Expenses

A multi-channel expense and project tracker: forward a voice note, a receipt photo, or plain text via Telegram or a mobile web page, and it's automatically transcribed, read, categorized, and logged — including per-project labor, work done, and area covered for site jobs.

**Start here: [SETUP_GUIDE.md](./SETUP_GUIDE.md)** — step-by-step instructions to get this deployed and connected, written for a first-time, non-technical setup.

## What's in here

- `app/api/telegram` — the Telegram bot webhook (voice/photo/text, `/project`, `/general`, `/approve`, `/pending`)
- `app/api/capture` — the same pipeline for the web capture page (`app/capture`)
- `app/dashboard` — expenses table, project breakdowns, team approvals (behind login)
- `lib/pipeline.ts` — the core logic: transcribe/OCR → AI extraction → duplicate check → save
- `lib/ai.ts` — the AI calls (Groq for voice, OpenRouter for vision + categorization)
- `lib/cost.ts` — AI usage/budget tracking
- `prisma/schema.prisma` — the full data model

## Local development

```
npm install
cp .env.example .env.local   # fill in real values — see SETUP_GUIDE.md
npm run db:push
npm run db:seed
npm run dev
```

## Deploying

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) — deploys to Vercel's free tier, with Supabase for the database, file storage, and dashboard login.
