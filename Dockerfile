# Dockerfile
FROM node:24-alpine

ARG NODE_PORT=2999

RUN mkdir -p /opt/app
WORKDIR /opt/app

COPY package.json yarn.lock /opt/app/
COPY bin /opt/app/bin/
COPY src /opt/app/src/
COPY tests /opt/app/tests/
COPY dist /opt/app/dist/
COPY scripts /opt/app/scripts/
COPY prisma /opt/app/prisma/
COPY nodemon.json  /opt/app/
COPY tsconfig.json  /opt/app/
COPY tsconfig.dist.json /opt/app/
COPY jest.config.ts /opt/app/
COPY .lintstagedrc /opt/app/
COPY .eslintrc /opt/app/
COPY .eslintignore /opt/app/
COPY .env /opt/app/
COPY .env.test /opt/app/
COPY applications.json /opt/app/

RUN yarn --pure-lockfile
RUN yarn build

EXPOSE $NODE_PORT
