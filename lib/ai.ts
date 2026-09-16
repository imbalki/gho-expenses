// AI pipeline: voice transcription -> receipt OCR -> structured extraction
// (expenses AND/OR a day's project activity — labor, work done, area covered).
//
// Providers used (both have generous free/cheap tiers and are OpenAI-compatible,
// matching the "cheaper open-source models" choice):
//   - GROQ_API_KEY        -> Whisper (large-v3-turbo) for voice transcription
//   - OPENROUTER_API_KEY  -> vision model for receipt OCR + text model for extraction
//
// You can swap models any time via the env vars below without touching this file.

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const TEXT_MODEL = process.env.OPENROUTER_TEXT_MODEL || 'deepseek/deepseek-chat';
const VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || 'qwen/qwen-2.5-vl-72b-instruct';

// Rough, deliberately conservative per-call cost estimates in USD — used only
// to catch a runaway budget, NOT a substitute for checking your real provider
// invoices. See lib/cost.ts.
export const COST_ESTIMATES = {
  transcribe: 0.0006, // Groq whisper-large-v3-turbo, ~30s average clip
  ocr: 0.002, // vision model call, image tokens are the bulk of the cost
  extract: 0.0008, // small/cheap text model call
};

export type ExpenseEntry = {
  type: 'expense';
  amount: number | null;
  vendor: string | null;
  category: string | null;
  date: string | null;
  note: string | null;
  confidence: number;
};

export type ActivityEntry = {
  type: 'activity';
  laborCount: number | null;
  wagePerHead: number | null;
  areaCoveredSqft: number | null;
  location: string | null;
  date: string | null;
  note: string | null; // description of work done
  confidence: number;
};

export type ExtractedEntry = ExpenseEntry | ActivityEntry;

export type ExtractionResult = {
  entries: ExtractedEntry[];
  projectMention: string | null; // matches one of the provided project names, if explicitly mentioned
};

/** Transcribe a voice note (ogg/opus/mp3/m4a) to text using Groq's hosted Whisper. */
export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error(
      'GROQ_API_KEY is not set. Get a free key at https://console.groq.com/keys and add it to your environment variables.'
    );
  }

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), filename);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'text');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${errText}`);
  }

  return (await res.text()).trim();
}

/** Run OCR + read a receipt image, returning raw text found on it. */
export async function readReceiptImage(buffer: Buffer, mimeType: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Get a key at https://openrouter.ai/keys and add it to your environment variables.'
    );
  }

  const base64 = buffer.toString('base64');

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Read this receipt or bill photo. Transcribe every line of text you can see (vendor name, items, amounts, date, totals) exactly as printed/handwritten. If it is blurry or partly unreadable, transcribe what you can and note what is unclear. Do not summarize — just transcribe.',
            },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Receipt OCR failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Turn free text (a transcription, OCR output, or a typed note) into one or
 * more structured entries — a purchase/payment (expense), a day's project
 * activity (labor + work done + area covered), or several of either when the
 * message describes multiple sites/crews/purchases at once.
 */
export async function extractEntries(
  rawText: string,
  opts: {
    categories: { name: string; description: string | null }[];
    projectNames: string[];
    currentProjectName: string | null;
  }
): Promise<ExtractionResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Get a key at https://openrouter.ai/keys and add it to your environment variables.'
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const categoryList = opts.categories
    .map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ''}`)
    .join('\n');
  const projectList = opts.projectNames.length ? opts.projectNames.map((p) => `- ${p}`).join('\n') : '(none yet)';

  const systemPrompt = `You are an assistant for a small paint/coatings manufacturing and distribution business in India (amounts are in INR unless stated otherwise). Someone forwarded a voice note transcript, a receipt photo transcript, or a short typed note. Turn it into one or more structured entries.

There are two kinds of entry:
1. "expense" — a purchase or payment (materials, fuel, transport, food, tools, etc.)
2. "activity" — a day's work log on a project site: how many laborers worked, what was done, and/or how much area (sqft) was covered. Use this whenever the message describes work being done (e.g. "6 labor", "coated", "applied", "primed", "sqft"), even if it also mentions a cost.

IMPORTANT: if the message describes work at MORE THAN ONE distinct site or crew (e.g. "6 labor at terrace did 1200 sqft, and 3 labor started the compound wall"), output a SEPARATE "activity" entry for each one — never merge headcounts or areas from different sites together. Likewise output separate "expense" entries for clearly distinct purchases.

Currently "active" project context for whoever sent this: ${opts.currentProjectName || 'General (no project)'}
Known project names (for detecting an explicit mention in the text):
${projectList}
Set "projectMention" to the exact matching project name ONLY if the text explicitly names one of the projects above (or an unambiguous variant of its name). Otherwise null — do not guess.

Available expense categories (choose the single best match for an "expense" entry, or null if truly nothing fits):
${categoryList}

Field rules:
- amount (expense only): the total paid, as a plain number, no currency symbols/commas. If multiple amounts appear, use the grand total. Null if not mentioned.
- vendor (expense only): shop/person/company name if mentioned, else null.
- category (expense only): exactly one of the category names above, or null.
- laborCount (activity only): number of laborers, or null.
- wagePerHead (activity only): rupees per laborer for the day, or null if not mentioned.
- areaCoveredSqft (activity only): sqft covered, or null if not mentioned.
- location (activity only): where on the site (e.g. "Terrace", "Compound / Block A"), or null if not mentioned/not applicable.
- date: ISO YYYY-MM-DD if clearly mentioned (relative terms like "yesterday" are relative to today = ${today}), else null (defaults to today).
- note: a short (under 12 words) human-readable summary — for expense, what it was for; for activity, what work was done.
- confidence: 0.0-1.0, your confidence in the key numeric fields (amount for expense; laborCount/areaCoveredSqft for activity). Lower for unclear audio/handwriting or ambiguous category.

Respond with ONLY a JSON object, no markdown, no explanation, matching exactly this shape:
{"entries": [{"type": "expense"|"activity", "amount": number|null, "vendor": string|null, "category": string|null, "laborCount": number|null, "wagePerHead": number|null, "areaCoveredSqft": number|null, "location": string|null, "date": string|null, "note": string|null, "confidence": number}], "projectMention": string|null}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Extraction failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { entries: [], projectMention: null };
  }

  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const entries: ExtractedEntry[] = rawEntries
    .map((e: any): ExtractedEntry | null => {
      const confidence = typeof e.confidence === 'number' ? Math.max(0, Math.min(1, e.confidence)) : 0;
      const date = e.date ?? null;
      const note = e.note ?? null;
      if (e.type === 'activity') {
        return {
          type: 'activity',
          laborCount: typeof e.laborCount === 'number' ? e.laborCount : null,
          wagePerHead: typeof e.wagePerHead === 'number' ? e.wagePerHead : null,
          areaCoveredSqft: typeof e.areaCoveredSqft === 'number' ? e.areaCoveredSqft : null,
          location: e.location ?? null,
          date,
          note,
          confidence,
        };
      }
      if (e.type === 'expense') {
        return {
          type: 'expense',
          amount: typeof e.amount === 'number' ? e.amount : null,
          vendor: e.vendor ?? null,
          category: e.category ?? null,
          date,
          note,
          confidence,
        };
      }
      return null;
    })
    .filter((e: ExtractedEntry | null): e is ExtractedEntry => e !== null);

  // Fallback: if the model returned nothing usable, treat the whole message as
  // a single low-confidence expense rather than silently dropping it.
  if (entries.length === 0) {
    entries.push({
      type: 'expense',
      amount: null,
      vendor: null,
      category: null,
      date: null,
      note: rawText.slice(0, 120),
      confidence: 0,
    });
  }

  return { entries, projectMention: parsed.projectMention ?? null };
}
