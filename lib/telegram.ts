const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function apiUrl(method: string) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not set.');
  return `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function sendMessage(chatId: number | string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return; // silently no-op if bot isn't configured yet (e.g. local dev)
  await fetch(apiUrl('sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

/** Downloads a Telegram file (voice note or photo) by file_id and returns its bytes. */
export async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
  const fileInfoRes = await fetch(`${apiUrl('getFile')}?file_id=${fileId}`);
  const fileInfo = await fileInfoRes.json();
  const filePath = fileInfo.result?.file_path;
  if (!filePath) throw new Error('Could not fetch file from Telegram.');

  const fileRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), filePath };
}

export function guessMimeFromPath(filePath: string): string {
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

// Minimal shape of what we read from a Telegram Update object.
export type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
    voice?: { file_id: string; mime_type?: string };
    audio?: { file_id: string; mime_type?: string };
    photo?: { file_id: string; file_size?: number }[];
    caption?: string;
  };
};
