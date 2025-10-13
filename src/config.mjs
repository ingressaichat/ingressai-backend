// Config centralizada, com defaults sensatos + .env
function bool(v, def=false){ if(v===undefined) return def; return String(v).toLowerCase()==="true"; }
function arr(v){ return String(v||"").split(",").map(s=>s.trim()).filter(Boolean); }

export const NODE_ENV = process.env.NODE_ENV || "development";
export const PORT = Number(process.env.PORT || 8080);

export const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
export const SITE_URL = process.env.SITE_URL || "https://ingressai.chat";

export const ALLOWED_ORIGINS = arr(process.env.ALLOWED_ORIGINS || `${SITE_URL},http://localhost:5173,http://localhost:${PORT}`);

export const GRAPH_VERSION = process.env.GRAPH_VERSION || "v20.0";
export const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.ACCESS_TOKEN || process.env.WABA_TOKEN || "";
export const APP_SECRET = process.env.APP_SECRET || "";
export const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || "";

export const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "ingressai123";
export const BRAND_NAME = process.env.BRAND_NAME || "IngressAI";
export const LOGO_URL = process.env.LOGO_URL || "https://ingressai.chat/logo_ingressai.png";

export const PUBLIC_WHATSAPP = process.env.PUBLIC_WHATSAPP || "";
export const ADMIN_PHONES = arr(process.env.ADMIN_PHONES || "");

export const TIMEZONE = process.env.TIMEZONE || "America/Sao_Paulo";
export const CURRENCY = process.env.CURRENCY || "BRL";

export const ENABLE_DASHBOARD = bool(process.env.ENABLE_DASHBOARD, true);
export const ENABLE_VALIDATOR = bool(process.env.ENABLE_VALIDATOR, true);

export const DEBUG = arr(process.env.DEBUG || ""); // ex: wa,webhook,db
