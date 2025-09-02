import { Router } from "express";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import axios from "axios";
import crypto from "crypto";
import { findEvent, pureEventName } from "../db.mjs";
import { log } from "../utils.mjs";

export const ticketsRouter = Router();
const purchases = new Map(); // code -> { eventId, to, name, qty, createdAt }

/* ===== ENV / WABA ===== */
const TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || "";
const APP_SECRET = process.env.APP_SECRET || "";
const BRAND = process.env.BRAND_NAME || "IngressAI";
const LOGO_URL = process.env.LOGO_URL || "";
const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/,"");
const GRAPH_API_BASE = process.env.GRAPH_API_BASE || "https://graph.facebook.com";
const GRAPH_VERSION  = process.env.GRAPH_API_VERSION || "v23.0";
const PHONE_ID       = process.env.PHONE_NUMBER_ID || process.env.PUBLIC_WABA || "";

const APP_PROOF = (APP_SECRET && TOKEN)
  ? crypto.createHmac("sha256", APP_SECRET).update(TOKEN).digest("hex")
  : null;

/* ===== Helpers ===== */
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const r = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(r.data);
  } catch { return null; }
}
function sanitizeFilename(s) {
  return String(s).replace(/[^\p{L}\p{N}\-_\. ]/gu, "").slice(0, 64) || "ingresso";
}

/* ===== Preview QR ===== */
ticketsRouter.get("/tickets/preview.png", async (req, res) => {
  try {
    const demo = req.query.code || "DEMO-CODE-123";
    const png = await QRCode.toBuffer(`${BASE_URL}/validate?c=${encodeURIComponent(demo)}`);
    res.set("Content-Type", "image/png").send(png);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/* ===== PDF ===== */
ticketsRouter.get("/tickets/pdf", async (req, res) => {
  const { code } = req.query;
  const data = purchases.get(code);
  if (!data) return res.status(404).send("Ticket não encontrado");
  const ev = findEvent(data.eventId);
  if (!ev) return res.status(404).send("Evento inválido");

  const filename = `${sanitizeFilename(ev.title)}_${code}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // quadro retrato confortável no iPhone
  const W = 432, H = 768;
  const doc = new PDFDocument({ size: [W, H], margin: 0 });
  doc.pipe(res);

  // sistema visual
  const PHI = 1.6180339887;
  const BG = "#F5F7FA";
  const CARD = "#FFFFFF";
  const OUTLINE = "#E5E7EB";
  const TXT = "#111111";
  const META = "#6E6E73";
  const META_LIGHT = "#8E8E93";
  const ACCENT = "#007AFF";
  const DIVIDER = "#C7C7CC";

  // escala
  const BASE = 12;
  const scale = (n) => Math.round(BASE * Math.pow(PHI, n));
  const f_title = scale(1.9);
  const f_meta  = scale(0.2);
  const f_name  = scale(1.4);
  const f_venue = 12;
  const f_foot  = scale(-0.3);
  const rhythm  = (k=1) => Math.round(10 * Math.pow(PHI, k));
  const pad     = Math.round(14 * PHI);

  // fundo + card
  doc.rect(0, 0, W, H).fill(BG);
  const card = { x: 24, y: 24, w: W - 48, h: H - 48, r: 30 };
  doc.save().fill(CARD).roundedRect(card.x, card.y, card.w, card.h, card.r).fill().restore();
  doc.save().lineWidth(0.8).strokeColor(OUTLINE)
    .roundedRect(card.x, card.y, card.w, card.h, card.r).stroke().restore();

  // fluxo superior
  let y = card.y + pad;

  // LOGO
  const logo = await fetchImageBuffer(LOGO_URL);
  if (logo) {
    const lw = 90;
    const logoX = card.x + (card.w - lw) / 2;
    doc.image(logo, logoX, y, { width: lw });
    y += Math.round(lw / PHI) + 28;
  } else {
    doc.fillColor(TXT).font("Helvetica-Bold").fontSize(18)
       .text(BRAND, card.x, y, { width: card.w, align: "center", characterSpacing: 0.2 });
    y += rhythm(0.9);
  }

  const xL = card.x + pad;
  const width = card.w - pad * 2;

  // Título (somente nome do evento)
  const title = pureEventName(ev);
  doc.fillColor(TXT).font("Helvetica-Bold").fontSize(f_title);
  const hTitle = doc.heightOfString(title, { width, align: "left" });
  doc.text(title, xL, y, { width, align: "left", characterSpacing: 0.2, lineGap: 1 });
  y += hTitle + Math.round(rhythm(1.1));

  // Meta (cidade + data/hora)
  const dt = new Date(ev.date);
  const datePart = dt.toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" });
  const h = dt.getHours();
  const m = dt.getMinutes();
  const horaStr = m === 0 ? `${h} horas` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} horas`;
  const metaText = `${ev.city}, ${datePart} às ${horaStr}`;
  doc.fillColor(META).font("Helvetica").fontSize(f_meta);
  const hMeta = doc.heightOfString(metaText, { width, align: "left" });
  doc.text(metaText, xL, y, { width, align: "left" });
  y += hMeta + Math.round(rhythm(1.1));

  // ===== Centralização do QR no espaço útil =====
  const footTop = card.y + card.h - pad - Math.max(34, rhythm(0.7));
  const divY    = footTop - Math.round(rhythm(0.25));

  const nameText = data.name || "Participante";
  doc.font("Helvetica-Bold").fontSize(f_name);
  const hName = doc.heightOfString(nameText, { width: card.w, align: "center" });

  const venueText = ev.venue || "";
  let hVenue = 0;
  if (venueText) {
    doc.font("Helvetica").fontSize(f_venue);
    hVenue = doc.heightOfString(venueText, { width: card.w, align: "center" });
  }

  const spaceAfterQR           = Math.round(rhythm(0.35));
  const spaceBetweenNameVenue  = venueText ? Math.round(rhythm(0.25)) : 0;
  const spaceVenueToDivider    = Math.round(rhythm(0.6));

  const qrW = Math.round(card.w * 0.56);
  const topEdge = y;
  const reservedBelow = spaceAfterQR + hName + spaceBetweenNameVenue + hVenue + spaceVenueToDivider;
  const available = (divY) - topEdge - reservedBelow;
  const qrY = topEdge + Math.max(0, Math.floor((available - qrW) / 2));

  const validateUrl = `${BASE_URL}/validate?c=${encodeURIComponent(code)}`;
  const qrBuf = await QRCode.toBuffer(validateUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    color: { dark: "#000000", light: "#FFFFFFFF" }
  });
  const qrX = card.x + (card.w - qrW) / 2;
  doc.image(qrBuf, qrX, qrY, { width: qrW });

  // Bloco abaixo do QR: nome + venue
  let yAfterQR = qrY + qrW + spaceAfterQR;

  doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(f_name)
     .text(nameText, card.x, yAfterQR, { width: card.w, align: "center", characterSpacing: 0.08 });
  yAfterQR += hName + spaceBetweenNameVenue;

  if (venueText) {
    doc.fillColor(TXT).font("Helvetica").fontSize(f_venue)
       .text(venueText, card.x, yAfterQR, { width: card.w, align: "center" });
    yAfterQR += hVenue;
  }

  // Divider + rodapé
  doc.save().opacity(0.16).lineWidth(0.6).strokeColor(DIVIDER)
    .moveTo(xL, divY).lineTo(xL + width, divY).stroke().restore();

  doc.fillColor(META_LIGHT).font("Helvetica").fontSize(f_foot)
     .text(`Código: ${code}\nQuantidade: ${data.qty}`, xL, footTop, { width, align: "left", lineGap: 2 });

  doc.end();
});

/* ===== validação mock ===== */
ticketsRouter.get("/validate", (req, res) => {
  const code = String(req.query.c || req.query.code || "");
  const data = purchases.get(code);
  if (!data) return res.status(404).json({ ok: false, status: "invalid" });
  return res.json({ ok: true, status: "valid", eventId: data.eventId, code });
});

/* ===== compra -> envia PDF como DOCUMENT ===== */
ticketsRouter.get("/purchase/start", async (req, res) => {
  try {
    const { ev: eventId, to, name, qty = 1 } = req.query;
    const ev = findEvent(String(eventId));
    if (!ev) return res.status(404).json({ ok: false, error: "Evento inválido" });

    const code = crypto.randomUUID(); // <<<<<< aqui!
    const buyer = String(name || "Participante");
    purchases.set(code, { code, eventId: ev.id, to, name: buyer, qty: Number(qty), createdAt: Date.now() });

    const pdfUrl = `${BASE_URL}/tickets/pdf?code=${encodeURIComponent(code)}`;
    const filename = `${sanitizeFilename(ev.title)}_${code}.pdf`;

    if (PHONE_ID && TOKEN) {
      await axios.post(
        `${GRAPH_API_BASE}/${GRAPH_VERSION}/${PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          type: "document",
          document: {
            link: pdfUrl,
            filename,
            caption: `✅ Compra confirmada!\n${pureEventName(ev)} • ${ev.city}\nQuantidade: ${qty}`
          }
        },
        {
          headers: { "Content-Type": "application/json" },
          params: { access_token: TOKEN, ...(APP_PROOF ? { appsecret_proof: APP_PROOF } : {}) }
        }
      );
    } else {
      log("waba.disabled", { to, pdfUrl });
    }

    log("purchase", { code, pdfUrl, to });
    res.json({ ok: true, code, pdfUrl });
  } catch (e) {
    log("purchase.error", e?.response?.data || e.message);
    res.status(500).json({ ok: false, error: "Falha na compra" });
  }
});

/* ===== reenvio do ingresso ===== */
ticketsRouter.post("/tickets/issue", async (req, res) => {
  try {
    const { orderId: code, to } = req.body || {};
    const data = purchases.get(code);
    if (!data) return res.status(404).json({ ok:false, error:"Pedido não encontrado" });
    const ev = findEvent(data.eventId);
    if (!ev) return res.status(404).json({ ok:false, error:"Evento inválido" });

    const pdfUrl = `${BASE_URL}/tickets/pdf?code=${encodeURIComponent(code)}`;
    const filename = `${sanitizeFilename(ev.title)}_${code}.pdf`;

    if (PHONE_ID && TOKEN) {
      await axios.post(
        `${GRAPH_API_BASE}/${GRAPH_VERSION}/${PHONE_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: to || data.to,
          type: "document",
          document: {
            link: pdfUrl,
            filename,
            caption: `📩 Reenvio do seu ingresso\n${pureEventName(ev)} • ${ev.city}\nQuantidade: ${data.qty}`
          }
        },
        {
          headers: { "Content-Type": "application/json" },
          params: { access_token: TOKEN, ...(APP_PROOF ? { appsecret_proof: APP_PROOF } : {}) }
        }
      );
    } else {
      log("waba.disabled", { to: to || data.to, pdfUrl });
    }

    res.json({ ok:true });
  } catch (e) {
    log("tickets.issue.error", e?.response?.data || e.message);
    res.status(500).json({ ok:false, error:"Falha ao reenviar" });
  }
});

/* ===== atalho de teste ===== */
ticketsRouter.get("/test/send-ticket", async (req, res) => {
  const { to, ev = "hello-world-uberaba", name = "Tester" } = req.query;
  if (!to) return res.status(400).json({ ok: false, error: "Parâmetro to é obrigatório" });
  try {
    const url = `${BASE_URL}/purchase/start?ev=${encodeURIComponent(ev)}&to=${encodeURIComponent(to)}&name=${encodeURIComponent(name)}&qty=1`;
    await axios.get(url);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
