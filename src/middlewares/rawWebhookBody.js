// Captura o corpo BRUTO (necessário pro HMAC da assinatura da Meta)
import getRawBody from 'raw-body';

export async function rawWebhookBody(req, res, next) {
  if (req.method !== 'POST') return next();
  try {
    const buf = await getRawBody(req);
    req.rawBody = buf;
    try {
      req.body = JSON.parse(buf.toString('utf8'));
    } catch {
      req.body = {};
    }
    next();
  } catch (err) {
    next(err);
  }
}
