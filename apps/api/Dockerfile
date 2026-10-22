FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install
COPY . .
RUN npm run db:generate && npm --workspace apps/api run build
EXPOSE 4000
CMD ["sh", "-c", "npm run db:push && npm --workspace apps/api run start"]
