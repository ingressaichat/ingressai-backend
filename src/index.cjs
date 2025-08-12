// src/index.cjs
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");

const webhookRouter = require("./routes/webhook");
const managementRouter = require("./routes/management");
const sendRouter = require("./routes/send");

const app = express();
const PORT = process.env.PORT || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// Lê lista de admins como array
const ADMIN_PHONES = (process.env.ADMIN_PHONES || "")
  .split(",")
  .map((num) => num.trim())
  .filter(Boolean);

console.log(`[INIT] Log level: ${LOG_LEVEL}`);
console.log(`[INIT] Admin phones: ${ADMIN_PHONES.join(", ")}`);

// Middleware para parse JSON
app.use(bodyParser.json());

// Middleware para injetar função de verificação de admin
app.use((req, res, next) => {
  req.isAdmin = (phone) => ADMIN_PHONES.includes(phone);
  next();
});

// Rotas principais
app.use("/webhook", webhookRouter);
app.use("/management", managementRouter);
app.use("/send", sendRouter);

app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
});
