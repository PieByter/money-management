#!/usr/bin/env node
/**
 * Auto commit: rekam semua perubahan ke git dengan pesan otomatis.
 *
 * Pemakaian:
 *   npm run autocommit                        → commit sekali (jika ada perubahan)
 *   npm run autocommit -- --push              → commit lalu push
 *   npm run autocommit:watch                  → pantau file & auto-commit (debounce 60 dtk)
 *   node scripts/auto-commit.mjs --watch --interval 15 --push
 *
 * Catatan: skrip ini menjalankan `git add -A`, jadi semua perubahan yang tidak
 * di-ignore oleh .gitignore akan ikut ter-commit. Aman dari kondisi merge/rebase
 * (dilewati) dan tidak membuat commit kosong.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const flagValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
};

const WATCH = hasFlag('--watch');
const PUSH = hasFlag('--push');
const INTERVAL_SECONDS = Math.max(3, Number(flagValue('--interval', '60')) || 60);
const IGNORED_SEGMENTS = ['.git', 'node_modules', '.next', '.data', 'coverage', 'dist', 'out'];

function git(gitArgs, options = {}) {
  return execFileSync('git', gitArgs, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function findRepoRoot() {
  try {
    return git(['rev-parse', '--show-toplevel']);
  } catch {
    console.error('[auto-commit] bukan repositori git. Jalankan `git init` dulu.');
    process.exit(1);
  }
}

const ROOT = findRepoRoot();

function inProgressOperation() {
  return [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply',
  ].some((entry) => existsSync(path.join(ROOT, '.git', entry)));
}

function wibTimestamp() {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
}

function buildMessage(stagedNameStatus) {
  const lines = stagedNameStatus.split('\n').filter(Boolean);
  const stats = { baru: 0, diubah: 0, dihapus: 0, lainnya: 0 };
  const files = [];

  for (const line of lines) {
    const [codes, ...rest] = line.split('\t');
    const kind = codes[0];
    files.push(rest.join(' -> '));
    if (kind === 'A') stats.baru += 1;
    else if (kind === 'M') stats.diubah += 1;
    else if (kind === 'D') stats.dihapus += 1;
    else stats.lainnya += 1;
  }

  const summary = [
    stats.diubah > 0 ? `${stats.diubah} diubah` : null,
    stats.baru > 0 ? `${stats.baru} baru` : null,
    stats.dihapus > 0 ? `${stats.dihapus} dihapus` : null,
    stats.lainnya > 0 ? `${stats.lainnya} lainnya` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const preview = files.slice(0, 10).map((file) => `- ${file}`).join('\n');
  const remainder = files.length > 10 ? `\n- …dan ${files.length - 10} file lain` : '';

  return [
    `chore: auto-commit ${wibTimestamp()} WIB`,
    '',
    `${lines.length} file berubah (${summary})`,
    preview + remainder,
    '',
    'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
  ].join('\n');
}

function runOnce(triggeredBy) {
  try {
    if (inProgressOperation()) {
      console.log('[auto-commit] dilewati: ada merge/rebase/cherry-pick yang belum selesai.');
      return;
    }

    const status = git(['status', '--porcelain']);
    if (!status) {
      if (triggeredBy) console.log(`[auto-commit] (${triggeredBy}) tidak ada perubahan.`);
      else console.log('[auto-commit] tidak ada perubahan untuk di-commit.');
      return;
    }

    git(['add', '-A']);
    const staged = git(['diff', '--cached', '--name-status']);
    if (!staged) {
      console.log('[auto-commit] tidak ada perubahan (hanya berkas yang di-ignore).');
      return;
    }

    const message = buildMessage(staged);
    execFileSync('git', ['commit', '-m', message], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    const shortHash = git(['rev-parse', '--short', 'HEAD']);
    console.log(`[auto-commit] commit dibuat: ${shortHash} ${message.split('\n')[0]}`);

    if (PUSH) {
      try {
        execFileSync('git', ['push'], { cwd: ROOT, stdio: 'inherit' });
      } catch {
        console.error('[auto-commit] push gagal — periksa remote/upstream (git push -u origin <branch>).');
      }
    }
  } catch (error) {
    console.error('[auto-commit] gagal:', error.message);
    process.exitCode = 1;
  }
}

if (!WATCH) {
  runOnce(null);
  process.exit(process.exitCode ?? 0);
}

console.log(
  `[auto-commit] memantau ${ROOT} (debounce ${INTERVAL_SECONDS} dtk, push: ${PUSH ? 'ya' : 'tidak'}). Ctrl+C untuk berhenti.`,
);

let timer = null;
const schedule = (reason) => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => runOnce(`otomatis: ${reason}`), INTERVAL_SECONDS * 1000);
};

watch(ROOT, { recursive: true }, (eventType, filename) => {
  if (!filename) {
    schedule(eventType);
    return;
  }
  const normalized = String(filename).replaceAll('\\', '/');
  if (IGNORED_SEGMENTS.some((segment) => normalized === segment || normalized.startsWith(`${segment}/`))) {
    return;
  }
  schedule(normalized);
});

process.on('SIGINT', () => {
  if (timer) clearTimeout(timer);
  console.log('\n[auto-commit] berhenti.');
  process.exit(0);
});
