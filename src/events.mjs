import express, { Router } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import crypto from 'crypto';
import { findEvent, pureEventName } from './events.mjs';
import { log, sanitizeFilename } from './utils.mjs';

export const ticketsRouter = Router();
const purchases = new Map(); // code -> { eventId, to, name, qty, createdAt, issued? }

/** ENV / BASE */
const TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || '';
const APP_SECRET = process.env.APP_SECRET || '';
const APP_PROOF = (APP_SECRET && TOKEN)
  ? crypto.createHmac('sha256', APP_SECRET).update(TOKEN).digest('hex')
  : null;

const BRAND = process.env.BRAND_NAME || 'IngressAI';
const LOGO_URL = process.env.LOGO_URL || 'https://ingressai.chat/logo_ingressai.png';

export const BASE_URL =
  process.env.BASE_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${process.env.PORT || 3000}`);

const GRAPH_API_BASE = process.env.GRAPH_API_BASE || 'https://graph.facebook.com';
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v23.0';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';

/** Helpers */
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(r.data);
  } catch { return null; }
}
async function sendWhatsAppDocument(to, link, filename, caption) {
  if (!to || !TOKEN || !PHONE_NUMBER_ID) return;
  await axios.post(
    `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link, filename, caption }
    },
    {
      headers: { 'Content-Type': 'application/json' },
      params: { access_token: TOKEN, ...(APP_PROOF ? { appsecret_proof: APP_PROOF } : {}) }
    }
  );
}

/** Exportado para uso no webhook */
export async function purchaseDirect({ eventId, to, name, qty = 1 }) {
  const ev = findEvent(String(eventId));
  if (!ev) throw new Error('Evento inválido');

  const code = uuidv4();
  const buyer = String(name || 'Participante');
  const chatTo = String(to || '').replace(/\D/g, '');
  const qtyN = Number(qty) || 1;

  const data = { code, eventId: ev.id, to: chatTo, name: buyer, qty: qtyN, createdAt: Date.now() };
  purchases.set(code, data);

  const pdfUrl = `${BASE_URL}/tickets/pdf?code=${encodeURIComponent(code)}`;
  const filename = `${sanitizeFilename(ev.title, 'ingresso')}_${code}.pdf`;
  const caption = `✅ Ingresso emitido!\n${pureEventName(ev)} • ${ev.city}\nQuantidade: ${qtyN}`;

  if (chatTo) await sendWhatsAppDocument(chatTo, pdfUrl, filename, caption);

  log('purchase', { ...data, pdfUrl });
  return { ...data, pdfUrl };
}

/** Preview util */
ticketsRouter.get('/tickets/preview.png', async (req, res) => {
  try {
    const demo = req.query.code || 'DEMO-CODE-123';
    const png = await QRCode.toBuffer(`${BASE_URL}/validate?c=${encodeURIComponent(demo)}`);
    res.set('Content-Type', 'image/png').send(png);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

/** ===== PDF Apple-like ===== */
ticketsRouter.get('/tickets/pdf', async (req, res) => {
  const { code } = req.query;
  const data = purchases.get(code);
  if (!data) return res.status(404).send('Ticket não encontrado');
  const ev = findEvent(data.eventId);
  if (!ev) return res.status(404).send('Evento inválido');

  const filename = `${sanitizeFilename(ev.title, 'ingresso')}_${code}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const W = 432, H = 768; // retrato “iPhone-friendly”
  const doc = new PDFDocument({ size: [W, H], margin: 0 });
  doc.pipe(res);

  // tokens visuais
  const PHI = 1.6180339887;
  const BG = '#F5F7FA';
  const CARD = '#FFFFFF';
  const OUTLINE = '#E5E7EB';
  const TXT = '#111111';
  const META = '#6E6E73';
  const META_LIGHT = '#8E8E93';
  const ACCENT = '#007AFF';
  const DIVIDER = '#C7C7CC';

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
    doc.fillColor(TXT).font('Helvetica-Bold').fontSize(18)
       .text(BRAND, card.x, y, { width: card.w, align: 'center', characterSpacing: 0.2 });
    y += rhythm(0.9);
  }

  const xL = card.x + pad;
  const width = card.w - pad * 2;

  // Título (puro)
  const title = pureEventName(ev);
  doc.fillColor(TXT).font('Helvetica-Bold').fontSize(f_title);
  const hTitle = doc.heightOfString(title, { width, align: 'left' });
  doc.text(title, xL, y, { width, align: 'left', characterSpacing: 0.2, lineGap: 1 });
  y += hTitle + Math.round(rhythm(1.1));

  // Meta cinza
  const dt = new Date(ev.date);
  const datePart = dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  const h = dt.getHours();
  const m = dt.getMinutes();
  const horaStr = m === 0 ? `${h} horas` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} horas`;
  const metaText = `${ev.city}, ${datePart} às ${horaStr}`;
  doc.fillColor(META).font('Helvetica').fontSize(f_meta);
  const hMeta = doc.heightOfString(metaText, { width, align: 'left' });
  doc.text(metaText, xL, y, { width, align: 'left' });
  y += hMeta + Math.round(rhythm(1.1));

  // ===== Centralização do QR =====
  const footTop = card.y + card.h - pad - Math.max(34, rhythm(0.7));
  const divY    = footTop - Math.round(rhythm(0.25));

  const nameText = data.name || 'Participante';
  doc.font('Helvetica-Bold').fontSize(f_name);
  const hName = doc.heightOfString(nameText, { width: card.w, align: 'center' });

  const venueText = ev.venue || '';
  let hVenue = 0;
  if (venueText) {
    doc.font('Helvetica').fontSize(f_venue);
    hVenue = doc.heightOfString(venueText, { width: card.w, align: 'center' });
  }

  const spaceAfterQR           = Math.round(rhythm(0.35));
  const spaceBetweenNameVenue  = venueText ? Math.round(rhythm(0.25)) : 0;
  const spaceVenueToDivider    = Math.round(rhythm(0.6));

  const qrW = Math.round(card.w * 0.56);
  const topEdge = y;
  const reservedBelow = spaceAfterQR + hName + spaceBetweenNameVenue + hVenue + spaceVenueToDivider;
  const available = (divY) - topEdge - reservedBelow;
  const qrY = topEdge + Math.max(0, Math.floor((available - qrW) / 2));

  // QR
  const validateUrl = `${BASE_URL}/validate?c=${encodeURIComponent(code)}`;
  const qrBuf = await QRCode.toBuffer(validateUrl, {
    errorCorrectionLevel: 'H', margin: 1, color: { dark: '#000000', light: '#FFFFFFFF' }
  });
  const qrX = card.x + (card.w - qrW) / 2;
  doc.image(qrBuf, qrX, qrY, { width: qrW });

  // Bloco abaixo do QR
  let yAfterQR = qrY + qrW + spaceAfterQR;

  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(f_name)
     .text(nameText, card.x, yAfterQR, { width: card.w, align: 'center', characterSpacing: 0.08 });
  yAfterQR += hName + spaceBetweenNameVenue;

  if (venueText) {
    doc.fillColor(TXT).font('Helvetica').fontSize(f_venue)
       .text(venueText, card.x, yAfterQR, { width: card.w, align: 'center' });
    yAfterQR += hVenue;
  }

  // Divider + rodapé
  doc.save().opacity(0.16).lineWidth(0.6).strokeColor(DIVIDER)
    .moveTo(xL, divY).lineTo(xL + width, divY).stroke().restore();

  doc.fillColor(META_LIGHT).font('Helvetica').fontSize(f_foot)
     .text(`Código: ${code}\nQuantidade: ${data.qty}`, xL, footTop, { width, align: 'left', lineGap: 2 });

  doc.end();
});

/** Validação (json/html simples) */
ticketsRouter.get('/validate', (req, res) => {
  const code = String(req.query.c || req.query.code || '');
  const data = purchases.get(code);
  if (!data) {
    if ((req.headers.accept || '').includes('text/html')) {
      return res.status(404).send('<h1>Ticket inválido</h1>');
    }
    return res.status(404).json({ ok: false, status: 'invalid' });
  }
  const payload = { ok: true, status: 'valid', eventId: data.eventId, code };
  if ((req.headers.accept || '').includes('text/html')) {
    return res.send(`<h1>Válido</h1><pre>${JSON.stringify(payload, null, 2)}</pre>`);
  }
  return res.json(payload);
});

/** Compra direta (query) — legado/teste */
ticketsRouter.get('/purchase/start', async (req, res) => {
  try {
    const { ev: eventId, to, name, qty = 1 } = req.query;
    const r = await purchaseDirect({ eventId, to, name, qty });
    res.json({ ok: true, ...r });
  } catch (e) {
    log('purchase_error', e?.response?.data || e.message);
    res.status(500).json({ ok: false, error: 'Falha na compra' });
  }
});

/** Adapter para landing: cria order */
ticketsRouter.post('/orders', express.json(), (req, res) => {
  try {
    const { eventId, qty = 1, buyer = {} } = req.body || {};
    const ev = findEvent(String(eventId));
    if (!ev) return res.status(404).json({ ok: false, error: 'Evento inválido' });
    const code = uuidv4();
    const name = String(buyer.name || 'Participante');
    const to = String(buyer.phone || '').replace(/\D/g, '');
    if (to && !/^\d{10,15}$/.test(to)) return res.status(400).json({ ok: false, error: 'phone inválido' });

    purchases.set(code, { code, eventId: ev.id, to, name, qty: Number(qty), createdAt: Date.now(), issued: false });
    return res.json({ ok: true, orderId: code });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

/** Emite ingresso de um orderId criado acima */
ticketsRouter.post('/tickets/issue', express.json(), async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const data = purchases.get(orderId);
    if (!data) return res.status(404).json({ ok: false, error: 'orderId inválido' });
    if (data.issued) return res.json({ ok: true, status: 'already_issued' });

    const r = await purchaseDirect({
      eventId: data.eventId,
      to: data.to,
      name: data.name,
      qty: data.qty
    });

    purchases.set(orderId, { ...data, issued: true });
    return res.json({ ok: true, orderId, pdfUrl: r.pdfUrl });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});

/** Atalho de teste — envia PDF pelo WhatsApp (se habilitado) */
const ENABLE_TEST_ENDPOINTS = String(process.env.ENABLE_TEST_ENDPOINTS || '1') === '1';
if (ENABLE_TEST_ENDPOINTS) {
  ticketsRouter.get('/test/send-ticket', async (req, res) => {
    try {
      const { to = '', name = 'Teste', ev = 'hello-world-uberaba', qty = 1 } = req.query;
    const r = await purchaseDirect({ eventId: ev, to, name, qty });
      res.json({ ok: true, ...r });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.response?.data || e.message });
    }
  });
}
