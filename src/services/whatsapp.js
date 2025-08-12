import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'https://graph.facebook.com/v23.0';

function getAppSecretProof() {
  const token = process.env.WHATSAPP_TOKEN || '';
  const secret = process.env.APP_SECRET || '';
  if (!token || !secret) return null;
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function authConfig(extra = {}) {
  const headers = {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json'
  };
  const appsecret_proof = getAppSecretProof();
  const params = appsecret_proof ? { appsecret_proof, ...(extra.params || {}) } : (extra.params || {});
  return { headers, params, ...extra };
}

export async function sendMessage(payload) {
  const url = `${BASE_URL}/${process.env.PHONE_NUMBER_ID}/messages`;
  const { data } = await axios.post(url, payload, authConfig());
  return data;
}

export async function subscribeAppToWaba() {
  const url = `${BASE_URL}/${process.env.WABA_ID}/subscribed_apps`;
  const { data } = await axios.post(url, null, authConfig());
  return data;
}

export async function listSubscribedApps() {
  const url = `${BASE_URL}/${process.env.WABA_ID}/subscribed_apps`;
  const { data } = await axios.get(url, authConfig());
  return data;
}
