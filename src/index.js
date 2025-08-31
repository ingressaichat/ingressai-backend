import express from 'express';
const app = express();
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.get('/', (_req, res) => res.send('IngressAI backend up'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[http] listening on ${PORT}`));
