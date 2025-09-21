// src/utils.mjs
export const log = (...a) => console.log("[ingressai]", ...a);
export const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");

export function fmtDateBR(dt) {
  try {
    const d = new Date(dt);
    return d.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
  } catch { return String(dt); }
}

export const fit = (s, n=60) => String(s||"").slice(0, n);
export const fitDesc = (s, n=72) => String(s||"").slice(0, n);
export const fmtPhoneLabel = (p) => `+${onlyDigits(p)}`;
export const maskPhone = (p) => {
  const d = onlyDigits(p);
  if (d.length < 10) return d;
  return d.replace(/^(\d{2})(\d{1,2})\d+(\d{2})$/, "+$1 ($2) ****-$3");
};
