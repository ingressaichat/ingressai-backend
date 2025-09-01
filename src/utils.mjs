export function log(evt, obj = {}) {
  const t = new Date().toISOString();
  try {
    const flat = Object.entries(obj).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" ");
    // eslint-disable-next-line no-console
    console.log(`[${t}] ${evt} ${flat}`);
  } catch {
    console.log(`[${t}] ${evt}`);
  }
}
