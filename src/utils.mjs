export function log(type, data) {
  try {
    const line = typeof data === 'string' ? { msg: data } : data;
    console.log(JSON.stringify({ t: new Date().toISOString(), type, ...line }));
  } catch {
    console.log(`[${new Date().toISOString()}] ${type}`, data);
  }
}

export function parseKV(text) {
  // converte "ev=hello-world qty=2 name=Joao autopay=1"
  const out = {};
  String(text || '')
    .split(/\s+/)
    .map(pair => pair.trim())
    .filter(Boolean)
    .forEach(pair => {
      const m = pair.match(/^([^=]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    });
  return out;
}

export function sanitizeFilename(s, fallback = 'file') {
  return (String(s || '').replace(/[^\p{L}\p{N}\-_. ]/gu, '').slice(0, 64) || fallback);
}
