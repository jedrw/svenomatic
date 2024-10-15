FROM node:lts-slim

COPY . .

RUN npm ci

CMD ["npm", "run", "start"]