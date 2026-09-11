FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
COPY tsconfig.json ./
RUN npx prisma generate
COPY src ./src
RUN npm run build
EXPOSE 4000
CMD ["sh","-c","npx prisma db push && npm run prisma:seed && npm start"]
