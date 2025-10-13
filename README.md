# IngressAI Backend

Express (ESM) + WhatsApp Cloud API (webhook com `appsecret_proof`) + emissão de PDF com QR.

## Rodando local

```bash
cp .env.example .env              # preencha WHATSAPP_TOKEN, APP_SECRET, WA_PHONE_NUMBER_ID etc
npm i
npm run dev                       # inicia em http://localhost:8080
# Health:
# http://localhost:8080/api/health
