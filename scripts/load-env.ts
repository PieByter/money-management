import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Muat .env.local lalu .env tanpa dependency, dengan prioritas:
 * variabel shell > .env.local > .env.
 * Dipakai skrip CLI (migrate/seed/drizzle-kit) karena tsx tidak memuat .env otomatis.
 */
export function loadEnvFiles(cwd: string = process.cwd()): void {
  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(cwd, file);
    if (!existsSync(filePath)) continue;

    for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const separator = line.indexOf('=');
      if (separator === -1) continue;

      const key = line.slice(0, separator).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(separator + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);

      process.env[key] = value;
    }
  }
}
