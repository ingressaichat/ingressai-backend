FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Instala só dependências de runtime
COPY package.json package-lock.json ./
RUN npm i --omit=dev

# Copia o código e assets públicos
COPY src ./src
COPY public ./public
COPY .env.example ./

EXPOSE 8080
CMD ["node", "src/server.mjs"]
