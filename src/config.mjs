const env = (k, d = undefined) => process.env[k] ?? d;

export const cfg = {
  PORT: Number(env('PORT', 3000)),
  BASE: env('APP_BASE_URL', `http://localhost:${env('PORT', 3000)}`),

  ADMIN_NUMBERS: new Set(
    (env('ADMIN_NUMBERS', '') || '')
      .split(',').map(s => s.trim()).filter(Boolean)
  ),
  ADMIN_TOKEN: env('ADMIN_TOKEN', ''),

  META_ACCESS_TOKEN: env('META_ACCESS_TOKEN', ''),
  PHONE_ID: env('WHATSAPP_PHONE_ID', ''),
  VERIFY_TOKEN: env('WHATSAPP_VERIFY_TOKEN', 'ingressai-verify-token')
};

export function isAdminNumber(msisdn) {
  return cfg.ADMIN_NUMBERS.has(String(msisdn));
}

export function checkAdmin(req) {
  const token = req.get('X-Admin-Token');
  if (token && token === cfg.ADMIN_TOKEN) return true;
  const num = req.get('X-Admin');
  if (num && isAdminNumber(num)) return true;
  return false;
}
