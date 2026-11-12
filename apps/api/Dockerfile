FROM node:20-alpine
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --omit=dev
COPY dist ./dist
EXPOSE 4003
CMD ["node", "dist/index.js"]
