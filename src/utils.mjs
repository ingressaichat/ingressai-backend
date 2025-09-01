export function log(evt, data = {}) {
  const t = new Date().toISOString();
  const payload = Object.assign({ evt, t }, data);
  // stringify estável
  try {
    // Remover undefined
    const cleaned = JSON.parse(JSON.stringify(payload));
    // Log simples
    console.log("[INFO]", ...Object.entries(cleaned).map(([k, v]) => `${k}=${JSON.stringify(v)}`));
  } catch (e) {
    console.log("[INFO]", `evt=${evt}`, `t=${t}`, data);
  }
}
