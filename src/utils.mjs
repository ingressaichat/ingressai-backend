export function log(...args) {
  const ts = new Date().toISOString();
  console.log(`[${ts}]`, ...args);
}

export function isAdmin(phone) {
  const admins = (process.env.ADMIN_PHONES || '').split(',').map(s => s.trim());
  return admins.includes(String(phone));
}

// Parse de: ingressai:start ev=ID qty=N autopay=1 name=Fulano da Silva
export function parseStartCommand(text) {
  const out = {};
  const parts = text.replace(/^ingressai:start\s*/i, '').trim().split(/\s+/);
  for (const p of parts) {
    const [k, ...rest] = p.split('=');
    if (k && rest.length) out[k] = rest.join('=');
  }
  return out;
}
