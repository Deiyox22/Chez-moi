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

// Serverless hosts cap a request at a minute or so; a lighter default keeps
// the design call inside that window. Override with ANTHROPIC_EFFORT.
const DEFAULT_EFFORT = process.env.VERCEL ? 'medium' : 'high';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

// Which provider runs is decided by AI_PROVIDER, or simply by the key present.
function resolveProvider() {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  if (forced === 'gemini' || forced === 'google') return 'gemini';
  if (forced === 'anthropic' || forced === 'claude') return 'anthropic';
  if (ANTHROPIC_KEY) return 'anthropic';
  if (GEMINI_KEY) return 'gemini';
  return null;
}

const PROVIDER = resolveProvider();

const DEFAULT_MODELS = {
  anthropic: 'claude-opus-5',
  gemini: 'gemini-2.5-flash',
};

export const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  maxBodyBytes: Number(process.env.MAX_BODY_BYTES || 26_214_400),
  ai: {
    provider: PROVIDER,
    apiKey: PROVIDER === 'gemini' ? GEMINI_KEY : ANTHROPIC_KEY,
    model:
      (PROVIDER === 'gemini' ? process.env.GEMINI_MODEL : process.env.ANTHROPIC_MODEL) ||
      DEFAULT_MODELS[PROVIDER] ||
      '',
    effort: EFFORTS.has(process.env.ANTHROPIC_EFFORT) ? process.env.ANTHROPIC_EFFORT : DEFAULT_EFFORT,
    enableFallbacks: process.env.ANTHROPIC_ENABLE_FALLBACKS === '1',
  },
  catalog: {
    // Fall back to a live web search on the store sites when the local
    // catalogues have nothing good for a need.
    liveSearch: process.env.CATALOG_LIVE_SEARCH === '1',
    liveSearchMinResults: Number(process.env.CATALOG_LIVE_MIN_RESULTS || 2),
  },
  paths: {
    web: path.join(ROOT, 'public'),
    stores: path.join(ROOT, 'config', 'stores.json'),
    seedCatalog: path.join(ROOT, 'server', 'catalog', 'data', 'seed-catalog.json'),
    syncedCatalog: path.join(ROOT, 'data', 'catalog'),
  },
};

export const aiConfigured = () => Boolean(config.ai.provider && config.ai.apiKey);
