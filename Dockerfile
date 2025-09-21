FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache fontconfig ttf-dejavu

COPY package*.json ./
RUN npm i --omit=dev

COPY public ./public
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080
ENV NODE_OPTIONS="--enable-source-maps --unhandled-rejections=strict"

CMD ["node","src/server.mjs"]
