import { join } from 'node:path';

export const PORT = Number(process.env.PORT || 8080);
export const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
export const WABA_TOKEN = process.env.WABA_TOKEN || '';
export const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ingressai123';

export const ADMIN_PHONES = (process.env.ADMIN_PHONES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// onde ficarão os arquivos estáticos servidos em /assets
export const ASSETS_DIR = process.env.ASSETS_DIR || '/mnt/data/landing';
export const EVENTS_ASSETS_DIR = join(ASSETS_DIR, 'events');
export const PUBLIC_ASSETS_BASE = `${BASE_URL}/assets`;
