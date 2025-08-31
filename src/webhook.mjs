import { Router } from 'express';
import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { log, parseKV } from './utils.mjs';
import { purchaseDirect } from './ticketsRouter.mjs';
import { setEventImage } from './events.mjs';

export const webhookRouter = Router();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ingressai123';
const TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || '';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
const ADMIN_NUMBERS = String(process.env.ADMIN_NUMBERS || process.env.ADMIN_PHONES || '')
  .split(',')
  .map(s => s.replace(/\D/g, ''))
  .filter(Boolean);

const GRAPH_API_BASE = process.env.GRAPH_API_BASE || 'https://graph.facebook.com';
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v23.0';

const ALLOW_IMAGE_UPLOADS = String(process.env.ALLOW_IMAGE_UPLOADS || '0') === '1';
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const MEDIA_BASE_URL = process.env.MEDIA_BASE_URL || (process.env.BASE_URL ? `${process.env.BASE_URL}/uploads` : '/uploads');

/** GET /webhook - verificação */
webhookRouter.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/** POST /webhook - eventos */
webhookRouter.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    res.sendStatus(200); // responde rápido

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const messages = value.messages || [];
        const statuses = value.statuses || [];

        // status de entrega/leitura
        for (const st of statuses) log('wa_status', st);

        for (const msg of messages) {
          const from = String(msg.from || '').replace(/\D/g, '');
          const type = msg.type;

          if (type === 'text' && msg.text?.body) {
            const text = msg.text.body.trim();

            // Deep link: ingressai:start ev=... qty=... autopay=1 name=...
            if (/^ingressai:start/i.test(text)) {
              const args = parseKV(text.replace(/^ingressai:start/i, ''));
              const eventId = args.ev || args.event || 'hello-world-uberaba';
              const qty = Number(args.qty || 1);
              const name = args.name || 'Participante';
              const autopay = String(args.autopay || '0') === '1';

              if (autopay) {
                try {
                  await purchaseDirect({ eventId, to: from, name, qty });
                } catch (e) {
                  await sendText(from, `⚠️ Erro ao emitir ingresso: ${shortError(e)}`);
                }
              } else {
                await sendText(from, `Perfeito! Para prosseguir com *${eventId}*, responda: *autopay=1* ou use o botão na landing.`);
              }
              continue;
            }

            // Admin: criar/atualizar evento simples
            if (isAdmin(from) && /^event:/i.test(text)) {
              const args = parseKV(text.replace(/^event:/i, ''));
              const payload = {
                id: args.id,
                title: args.title?.replace(/^"|"$/g, '') || args.title,
                city: args.city,
                venue: args.venue?.replace(/^"|"$/g, '') || args.venue,
                date: args.date,
                price: args.price ? Number(args.price) : undefined,
                currency: args.currency || 'BRL',
                imageUrl: args.imageUrl
              };
              try {
                await axios.post(`${process.env.BASE_URL}/events`, payload, {
                  headers: { 'x-admin-token': process.env.ADMIN_TOKEN || '' }
                });
                await sendText(from, `✅ Evento atualizado/criado: ${payload.id}\nAparece na landing em segundos.`);
              } catch (e) {
                await sendText(from, `⚠️ Falha ao salvar evento via API.\n${shortError(e)}`);
              }
              continue;
            }

            // fallback
            await sendText(from, '👋 Para comprar: `ingressai:start ev=<id> qty=<n> autopay=1 name=<seu nome>`');
            continue;
          }

          // Imagem enviada por admin com legenda "ev=<id>" -> define imageUrl do evento
          if (type === 'image' && isAdmin(from) && msg.image?.id) {
            const evId = msg.caption?.match(/ev=([^\s]+)/)?.[1];
            if (!evId) { await sendText(from, 'Legenda ausente. Use `ev=<idDoEvento>`.'); continue; }

            try {
              const meta = await axios.get(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${msg.image.id}`, {
                params: { access_token: TOKEN }
              }).then(r => r.data);

              let finalUrl = meta?.url || null;

              // opcional: espelhar em /uploads (recomendado por estabilidade)
              if (ALLOW_IMAGE_UPLOADS && finalUrl) {
                try {
                  const r = await axios.get(finalUrl, { responseType: 'arraybuffer' });
                  const ct = String(r.headers['content-type'] || 'image/jpeg');
                  const ext = extFromMime(ct) || '.jpg';
                  const filename = `${Date.now()}_${msg.image.id.slice(-8)}${ext}`;
                  await fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});
                  await fs.writeFile(path.join(UPLOADS_DIR, filename), Buffer.from(r.data));
                  finalUrl = `${MEDIA_BASE_URL}/${filename}`;
                } catch (e) {
                  log('mirror_fail', e?.response?.data || e.message);
                }
              }

              if (!finalUrl) { await sendText(from, 'Não consegui obter a URL pública da imagem.'); continue; }

              setEventImage(evId, finalUrl);
              await sendText(from, `✅ Imagem vinculada a *${evId}*.\nAtualize a landing para ver.`);
            } catch (e) {
              await sendText(from, `⚠️ Erro ao vincular imagem: ${shortError(e)}`);
            }
            continue;
          }
        }
      }
    }
  } catch (e) {
    log('webhook_error', e?.response?.data || e.message);
    // já respondido 200 acima
  }
});

/** Helpers WhatsApp */
async function sendText(to, body) {
  const TOKEN = process.env.WHATSAPP_TOKEN || process.env.WABA_TOKEN || '';
  if (!TOKEN || !PHONE_NUMBER_ID) return;
  try {
    await axios.post(
      `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: 'whatsapp', to, text: { body } },
      { params: { access_token: TOKEN } }
    );
  } catch (e) {
    log('wa_send_error', e?.response?.data || e.message);
  }
}

function isAdmin(phone) {
  const n = String(phone || '').replace(/\D/g, '');
  return ADMIN_NUMBERS.includes(n);
}
function shortError(e) {
  return e?.response?.data?.error?.message || e?.message || 'erro';
}
function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return '.png';
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('webp')) return '.webp';
  if (m.includes('gif')) return '.gif';
  return '';
}
