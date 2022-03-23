FROM node:14.19-alpine3.15 as build-deps
WORKDIR /usr/src/app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . ./
RUN npm run build

CMD npm start