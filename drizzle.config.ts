import { defineConfig } from 'drizzle-kit';
import { loadEnvFiles } from './scripts/load-env';

loadEnvFiles();

const rawUrl = process.env.DATABASE_URL?.trim();
const url = rawUrl && !rawUrl.includes('<') && !rawUrl.includes('>') ? rawUrl : undefined;

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  ...(url ? { dbCredentials: { url } } : {}),
});
