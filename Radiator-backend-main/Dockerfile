# Radiator API — production image
FROM node:22-alpine

WORKDIR /app

# Install production deps first so code changes don't bust the layer cache.
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000

# Run unprivileged; config comes from container env vars (no .env in the image).
USER node
CMD ["node", "src/index.js"]
