FROM node:22-alpine

# libs para PDFKit e fontes
RUN apk add --no-cache fontconfig ttf-dejavu curl

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev 2>/dev/null || npm i --omit=dev

COPY . .
RUN adduser -D -H -s /sbin/nologin appuser && chown -R appuser:appuser /app
USER appuser

ENV NODE_ENV=production
CMD ["node","src/server.mjs"]
