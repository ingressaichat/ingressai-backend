import { createServer } from './server.mjs';
import { config } from './config.mjs';

const app = await createServer();
const port = config.port;
app.listen(port, () => {
  console.log(`[ingressai] server on :${port}`);
});
