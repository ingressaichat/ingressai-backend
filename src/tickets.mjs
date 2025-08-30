import { Router } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { findEvent } from './events.mjs';
import { log } from './utils.mjs';
import axios from 'axios';

export const ticketsRouter = Router();
const purchases = new Map(); // code -> { eventId, to, name, qty, createdAt }

ticketsRouter.get('/tickets/preview.png', async (req, res) => {
  try {
    const demo = req.query.code || 'DEMO-CODE-123';
    const png = await QRCode.toBuffer(`${process.env.BASE_URL}/validate?c=${encodeURIComponent(demo)}`);
    res.set('Content-Type', 'image/png').send(png);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

ticketsRouter.get('/tickets/pdf', async (req, res) => {
  const { code } = req.query;
  const data = purchases.get(code);
  if (!data) return res.status(404).send('Ticket não encontrado');
  const ev = findEvent(data.eventId);
  if (!ev) return res.status(404).send('Evento inválido');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="ticket_${data.code || code}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  doc.fontSize(22).text(process.env.BRAND_NAME || 'IngressAI');
  doc.moveDown();
  doc.fontSize(18).text(ev.title);
  doc.fontSize(12).fillColor('#555').text(`${ev.city} • ${new Date(ev.date).toLocaleString('pt-BR')}`);
  doc.moveDown();

  const validateUrl = `${process.env.BASE_URL}/validate?c=${encodeURIComponent(code)}`;
  const qr = await QRCode.toBuffer(validateUrl);
  doc.image(qr, { fit: [180, 180] });

  doc.moveDown();
  doc.fillColor('black').fontSize(12).text(`Código: ${code}`);
  doc.text(`Comprador: ${data.name}`);
  doc.text(`Quantidade: ${data.qty}`);

  doc.end();
});

ticketsRouter.get('/validate', (req, res) => {
  const code = String(req.query.c || req.query.code || '');
  const data = purchases.get(code);
  if (!data) return res.status(404).json({ ok: false, status: 'invalid' });
  return res.json({ ok: true, status: 'valid', eventId: data.eventId, code });
});

// GET /purchase/start?ev=ID&to=55...&name=Fulano&qty=1&autopay=1
ticketsRouter.get('/purchase/start', async (req, res) => {
  try {
    const { ev: eventId, to, name, qty = 1 } = req.query;
    const ev = findEvent(String(eventId));
    if (!ev) return res.status(404).json({ ok: false, error: 'Evento inválido' });

    const code = uuidv4();
    purchases.set(code, { code, eventId: ev.id, to, name: String(name || 'Comprador'), qty: Number(qty), createdAt: Date.now() });

    const pdfUrl = `${process.env.BASE_URL}/tickets/pdf?code=${encodeURIComponent(code)}`;
    const text = `✅ Compra confirmada! Aqui está seu ingresso:\n${pdfUrl}`;

    await axios.post(`https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    }, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN}` } });

    res.json({ ok: true, code, pdfUrl });
  } catch (e) {
    log('purchase error', e?.response?.data || e.message);
    res.status(500).json({ ok: false, error: 'Falha na compra' });
  }
});

ticketsRouter.get('/test/send-ticket', async (req, res) => {
  const { to, ev = 'hello-world-uberaba', name = 'Tester' } = req.query;
  if (!to) return res.status(400).json({ ok: false, error: 'Parâmetro to é obrigatório' });
  try {
    const url = `${process.env.BASE_URL}/purchase/start?ev=${encodeURIComponent(ev)}&to=${encodeURIComponent(to)}&name=${encodeURIComponent(name)}&qty=1&autopay=1`;
    await axios.get(url);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
