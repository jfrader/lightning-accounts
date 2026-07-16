# Dockerfile
FROM node:24.18.0-alpine

RUN test "$(yarn --version)" = "1.22.22"

ARG NODE_PORT=2999
ENV NODE_ENV=development

RUN mkdir -p /opt/app
WORKDIR /opt/app

COPY package.json yarn.lock /opt/app/
COPY bin /opt/app/bin/
COPY src /opt/app/src/
COPY tests /opt/app/tests/
COPY dist /opt/app/dist/
COPY scripts /opt/app/scripts/
COPY prisma /opt/app/prisma/
COPY nodemon.json /opt/app/
COPY jest.config.ts /opt/app/
COPY tsconfig.json  /opt/app/
COPY tsconfig.build.json /opt/app/
COPY tsconfig.test.json /opt/app/
COPY tsconfig.dist.json /opt/app/
COPY eslint.config.mjs /opt/app/

RUN yarn install --frozen-lockfile
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public yarn build
RUN chown -R node:node /opt/app

EXPOSE $NODE_PORT
USER node
