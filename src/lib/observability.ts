/**
 * Pelaporan error terstruktur. Selalu menulis log JSON ke console; bila
 * `SENTRY_DSN` diisi, event juga dikirim ke Sentry memakai envelope HTTP
 * (tanpa menambah dependency SDK). Kegagalan pelaporan tidak pernah
 * mengganggu alur aplikasi.
 */

type Context = Record<string, unknown>;

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

export function captureError(error: unknown, context: Context = {}): void {
  const normalized = asError(error);
  const eventId = (() => {
    try {
      return globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `${Date.now()}`;
    } catch {
      return `${Date.now()}`;
    }
  })();

  console.error(
    JSON.stringify({
      level: 'error',
      eventId,
      timestamp: new Date().toISOString(),
      message: normalized.message,
      stack: normalized.stack,
      ...context,
    }),
  );

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  void sendToSentry(dsn, normalized, context, eventId).catch(() => {
    // Jangan pernah melempar dari jalur pelaporan.
  });
}

async function sendToSentry(
  dsn: string,
  error: Error,
  context: Context,
  eventId: string,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return;
  }
  const publicKey = url.username;
  const projectId = url.pathname.replace(/^\//, '');
  if (!publicKey || !projectId) return;

  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? 'money-tracker-dev',
    message: error.message,
    extra: { ...context, stack: error.stack },
  };
  const envelope = [
    JSON.stringify({
      event_id: eventId,
      sent_at: new Date().toISOString(),
      dsn,
    }),
    JSON.stringify({ type: 'event', content_type: 'application/json' }),
    JSON.stringify(event),
  ].join('\n');

  const response = await fetch(`https://${url.host}/api/${projectId}/envelope/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=money-tracker/0.1`,
    },
    body: envelope,
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    console.warn('[observability] Sentry menolak event', response.status);
  }
}
