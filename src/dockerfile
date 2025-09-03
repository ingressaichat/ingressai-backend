# syntax=docker/dockerfile:1.6
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependências nativas mínimas p/ pdfkit
RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Railway injeta $PORT
EXPOSE 3000
CMD ["npm", "run", "start"]
