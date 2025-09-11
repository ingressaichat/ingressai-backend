cat > Dockerfile <<'EOF'
FROM node:22-alpine

WORKDIR /app

# Instala só prod (evita fragilidade do npm ci com lock divergente)
COPY package*.json ./
RUN npm i --omit=dev

# Código e estáticos
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "src/server.mjs"]
EOF
