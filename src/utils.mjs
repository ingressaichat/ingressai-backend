import crypto from "crypto";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale/index.js";

export function onlyDigits(v=""){ return String(v).replace(/\D+/g, ""); }
export function fmtDateBR(iso){
  if(!iso) return "-";
  try { return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return String(iso); }
}
export function uid(prefix="id"){ return `${prefix}_${Math.random().toString(36).slice(2,8)}_${Date.now().toString(36)}`; }

export function toProof(token, appSecret){
  // appsecret_proof = HMAC-SHA256(token, appsecret)
  return crypto.createHmac("sha256", appSecret).update(token).digest("hex");
}

export function verifyMetaSignature({ appSecret, signatureHeader, rawBody }){
  try{
    if(!signatureHeader || !appSecret || !rawBody) return false;
    const [algo, sig] = String(signatureHeader).split("=");
    if (algo !== "sha256") return false;
    const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(sig,"hex"), Buffer.from(expected,"hex"));
  }catch{
    return false;
  }
}

// logs por área: use DEBUG="wa,webhook,db"
export function dbg(area, ...args){
  const areas = (process.env.DEBUG||"").split(",").map(s=>s.trim());
  if(areas.includes(area)) console.debug(`[${area}]`, ...args);
}
