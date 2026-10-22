FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm install
COPY . .
RUN npm run build --workspace apps/web
EXPOSE 3000
CMD ["npm", "--workspace", "apps/web", "run", "start"]
