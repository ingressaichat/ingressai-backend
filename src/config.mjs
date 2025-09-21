// src/config.mjs
export const BRAND_NAME = process.env.BRAND_NAME || "IngressAI";
export const BASE_URL = (process.env.BASE_URL || process.env.PUBLIC_URL || process.env.SITE_URL || "").replace(/\/$/, "");
export const GRAPH_VERSION = process.env.GRAPH_VERSION || "v20.0";
export const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.META_TOKEN || process.env.ACCESS_TOKEN || "";
export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
export const APP_SECRET = process.env.APP_SECRET || process.env.WHATSAPP_APP_SECRET || "";
export const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "ingressai123";

export const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret";
export const ADMIN_PHONES = String(process.env.ADMIN_PHONES || "")
  .split(",").map(s=>s.trim().replace(/\D+/g,"")).filter(Boolean);
export const ORG_PHONES = String(process.env.ORGANIZER_PHONES || process.env.ORG_PHONES || "")
  .split(",").map(s=>s.trim().replace(/\D+/g,"")).filter(Boolean);
