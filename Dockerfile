FROM node:22-alpine

WORKDIR /app
RUN apk add --no-cache fontconfig ttf-dejavu

COPY package*.json ./
RUN npm i --omit=dev

COPY public ./public
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.mjs"]
