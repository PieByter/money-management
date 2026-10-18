export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const OK = { ok: true } as const;

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
