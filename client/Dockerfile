FROM node:12-alpine

WORKDIR /home/node

ADD package*.json ./
RUN npm install

CMD ["npm", "run", "dev"]
