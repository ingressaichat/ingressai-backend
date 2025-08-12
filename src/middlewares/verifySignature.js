// Valida X-Hub-Signature-256 com APP_SECRET (requisito da Meta)
import crypto from 'crypto';

export function verifySignature(req, res, next) {
  if (req.method !== 'POST') return next();

  const signature = req.get('X-Hub-Signature-256') || '';
  const appSecret = process.env.APP_SECRET || '';
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', appSecret).update(req.rawBody || '').digest('hex');

  if (!signature || signature.length !== expected.length) {
    console.error('[webhook] assinatura ausente/inesperada');
    return res.sendStatus(401);
  }

  try {
    const ok = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) {
      console.error('[webhook] assinatura inválida');
      return res.sendStatus(401);
    }
  } catch (e) {
    console.error('[webhook] erro comparando assinatura', e.message);
    return res.sendStatus(401);
  }

  next();
}
