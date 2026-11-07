# Personal Radar in a container. Data lives in the /data volume; nothing is written inside the image.
#   docker compose up -d   → http://localhost:3210
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production RADAR_DATA_DIR=/data RADAR_PORT=3210
COPY --from=build /app ./
VOLUME /data
EXPOSE 3210
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3210", "-H", "0.0.0.0"]
