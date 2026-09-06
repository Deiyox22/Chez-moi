import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader so the project stays dependency-free apart from the Anthropic SDK.
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 26_214_400),
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
    effort: EFFORTS.has(process.env.ANTHROPIC_EFFORT) ? process.env.ANTHROPIC_EFFORT : 'high',
    enableFallbacks: process.env.ANTHROPIC_ENABLE_FALLBACKS === '1',
  },
  paths: {
    web: path.join(ROOT, 'web'),
    stores: path.join(ROOT, 'config', 'stores.json'),
    seedCatalog: path.join(ROOT, 'server', 'catalog', 'data', 'seed-catalog.json'),
    syncedCatalog: path.join(ROOT, 'data', 'catalog'),
  },
};

export const aiConfigured = () => Boolean(config.anthropic.apiKey);
