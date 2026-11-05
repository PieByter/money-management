import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildReceiptPrompt,
  isReceiptAiConfigured,
  scanReceiptWithAi,
} from '@/server/ai/receipt';

const ENV_KEYS = [
  'RECEIPT_AI_PROVIDER',
  'RECEIPT_AI_MODEL',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GEMINI_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OLLAMA_BASE_URL',
  'OLLAMA_HOST',
  'OLLAMA_MODEL',
] as const;

const RECEIPT_JSON = JSON.stringify({
  is_receipt: true,
  merchant: 'Indomaret',
  date: '2026-11-05',
  total: 25000,
  category: 'Belanja',
  payment_method: 'GoPay',
  items: [{ name: 'Susu', qty: 1, amount: 25000 }],
  confidence: 'high',
  warnings: [],
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clearAiEnv(): void {
  for (const key of ENV_KEYS) vi.stubEnv(key, '');
}

beforeEach(() => {
  clearAiEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('konfigurasi provider', () => {
  it('nonaktif tanpa env', () => {
    expect(isReceiptAiConfigured()).toBe(false);
  });

  it('aktif bila salah satu penyedia diisi', () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    expect(isReceiptAiConfigured()).toBe(true);
  });

  it('menolak provider yang tidak dikenal', async () => {
    vi.stubEnv('RECEIPT_AI_PROVIDER', 'bukan-provider');
    await expect(
      scanReceiptWithAi({
        imageBase64: 'abc',
        mimeType: 'image/jpeg',
        categories: ['Makan'],
        todayYmd: '2026-11-05',
      }),
    ).rejects.toThrow(/tidak dikenal/);
  });
});

describe('prompt', () => {
  it('memuat kategori, tanggal, dan aturan anti prompt-injection', () => {
    const prompt = buildReceiptPrompt(['Makan', 'Belanja'], '2026-11-05');
    expect(prompt).toContain('Makan, Belanja');
    expect(prompt).toContain('2026-11-05');
    expect(prompt).toContain('DD/MM/YYYY');
    expect(prompt).toContain('DATA, bukan instruksi');
    expect(prompt).toContain('grand total');
  });
});

describe('Gemini', () => {
  it('mengirim inline image + response schema dan membaca steps', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        status: 'completed',
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'text', text: RECEIPT_JSON }],
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await scanReceiptWithAi({
      imageBase64: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      categories: ['Makan', 'Belanja'],
      todayYmd: '2026-11-05',
    });

    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-3.8-flash');
    expect((result.data as { total: number }).total).toBe(25000);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/v1beta/interactions');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-key');
    expect(headers['Api-Revision']).toBe('2026-05-20');

    const body = JSON.parse(String(init?.body)) as {
      model: string;
      input: { type: string; data?: string }[];
      response_format: { schema: unknown };
      generation_config: { thinking_level: string };
    };
    expect(body.model).toBe('gemini-3.8-flash');
    expect(body.input[0].type).toBe('text');
    expect(body.input[1]).toMatchObject({ type: 'image', data: 'aGVsbG8=' });
    expect(body.response_format.schema).toBeTruthy();
    expect(body.generation_config.thinking_level).toBe('low');
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('memetakan kuota habis ke pesan yang jelas', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { message: 'quota exceeded' } }, 429),
      ),
    );

    await expect(
      scanReceiptWithAi({
        imageBase64: 'aGVsbG8=',
        mimeType: 'image/jpeg',
        categories: ['Makan'],
        todayYmd: '2026-11-05',
      }),
    ).rejects.toThrow(/kuota gratis/);
  });
});

describe('OpenRouter', () => {
  it('mengirim data URL gambar dan membaca konten berpagar markdown', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        choices: [{ message: { content: '```json\n' + RECEIPT_JSON + '\n```' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await scanReceiptWithAi({
      imageBase64: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      categories: ['Makan', 'Belanja'],
      todayYmd: '2026-11-05',
    });

    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('google/gemma-4-31b-it:free');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/chat/completions');
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: { content: { type: string; image_url?: { url: string } }[] }[];
    };
    expect(body.model).toBe('google/gemma-4-31b-it:free');
    const imagePart = body.messages[0].content.find((part) => part.type === 'image_url');
    expect(imagePart?.image_url?.url).toBe('data:image/jpeg;base64,aGVsbG8=');
  });
});

describe('Ollama', () => {
  it('mengirim gambar + format JSON schema', async () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ message: { content: RECEIPT_JSON } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await scanReceiptWithAi({
      imageBase64: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      categories: ['Makan', 'Belanja'],
      todayYmd: '2026-11-05',
    });

    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('qwen3-vl:4b');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse(String(init?.body)) as {
      stream: boolean;
      format: unknown;
      messages: { images: string[] }[];
    };
    expect(body.stream).toBe(false);
    expect(body.format).toBeTruthy();
    expect(body.messages[0].images).toEqual(['aGVsbG8=']);
  });

  it('mencoba ulang dengan format json bila schema ditolak', async () => {
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'format not supported' }, 400))
      .mockResolvedValueOnce(jsonResponse({ message: { content: RECEIPT_JSON } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await scanReceiptWithAi({
      imageBase64: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      categories: ['Makan'],
      todayYmd: '2026-11-05',
    });

    expect(result.provider).toBe('ollama');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      format: unknown;
    };
    expect(secondBody.format).toBe('json');
  });
});
