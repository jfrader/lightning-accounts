# Lightning Accounts

[![npm version](https://img.shields.io/npm/v/lightning-accounts?style=flat)](https://www.npmjs.com/package/lightning-accounts)
[![npm downloads](https://img.shields.io/npm/dm/lightning-accounts?style=flat)](https://www.npmjs.com/package/lightning-accounts)
[![ci](https://img.shields.io/github/actions/workflow/status/jfrader/lightning-accounts/ci.yml?branch=master&style=flat&label=ci)](https://github.com/jfrader/lightning-accounts/actions)
[![license](https://img.shields.io/github/license/jfrader/lightning-accounts?style=flat)](./LICENSE)
[![node](https://img.shields.io/node/v/lightning-accounts?style=flat)](https://www.npmjs.com/package/lightning-accounts)

Nodejs server that allows users to register and deposit/withdraw satoshis using the Bitcoin Lightning Network.

## Quick Start

Install the dependencies:

```bash
yarn
```

Set the environment variables:

```bash
cp .env.example .env

# open .env and modify the environment variables (if needed)
```

## Commands

Running locally:

```bash
yarn start
```

Database:

```bash
# push changes to db
yarn db:push

# start prisma studio
yarn db:studio
```

Docker tests:

```bash
# Run the Lightning Accounts Docker Jest/e2e suite.
NODE_ENV=test ./init-test.sh

# Start the persistent API/regtest backend used by Trucoshi e2e tests.
NODE_ENV=test ./init-e2e.sh
```

Docker migrations:

```bash
# Staging: run after building the new image and starting postgres, before starting server.
docker compose -f docker-compose.staging.yml --env-file .env build server
docker compose -f docker-compose.staging.yml --env-file .env up -d postgres
yarn docker:staging:migrate
docker compose -f docker-compose.staging.yml --env-file .env up -d --build server

# Production uses the same sequence with docker-compose.prod.yml and yarn docker:prod:migrate.
```

Production and staging migrations use `prisma migrate deploy`. Do not run `prisma db seed` or
`start:migrate` against staging or production data.

Admin users:

```bash
# Promote an existing staging user by email. The staging server container must already be running.
yarn docker:staging:make-admin --email you@example.com

# Promote an existing production user by email. The production server container must already be running.
yarn docker:prod:make-admin --email you@example.com
```

These commands only update an existing non-`APPLICATION` user to `ADMIN`; they do not create users
or run seeds.

Lint and format: `yarn lint`, `yarn prettier` (append `:fix` to fix).

## npm Releases

Releases publish a committed, reviewed tarball through GitHub Actions trusted
publishing (no stored npm token). See [RELEASING.md](RELEASING.md).

## Configuration

All settings are environment variables; see `.env.example` and
`src/config/config.ts`.

Behind nginx, set `NODE_TRUSTED_PROXY_IP` to the proxy IP or CIDR
(comma-separated) so Express derives `req.ip` and `req.secure` from
`X-Forwarded-*`:

```nginx
location / {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://127.0.0.1:2999;
}
```

## Docker

- `Dockerfile` is the dev/test image (with dev dependencies); `Dockerfile.prod`
  is the production image used by `docker-compose.prod.yml`.
- Image builds run Swagger generation, which imports app config, so the build
  injects throwaway values for `DATABASE_URL`, `NODE_ORIGIN`, `JWT_SECRET`,
  `JWT_BASE64_PUBLIC_KEY`, `JWT_BASE64_PRIVATE_KEY`, and `SEED_HASH_SECRET`.
  Containers read real values from `.env`.
- `yarn docker:staging` and `yarn docker:prod` build the new image before
  recreating containers, so a failed build leaves the running version up. They
  never run `docker compose down`.

## Code map

```
src/
  config/       env config, roles, passport, logger
  routes/v1/    auth, users, wallet, support, docs (Swagger JSDoc in route files)
  controllers/  request handlers
  services/     business logic (auth, wallet, lightning, email, tokens)
  middlewares/  auth, validate (Joi), rate limits, errors
  validations/  Joi schemas
  utils/        ApiError, catchAsync, helpers
prisma/         schema, migrations, seed
tests/          unit and e2e (Jest)
```

API docs are served at `http://localhost:3000/v1/docs` (generated from the
Swagger comments in `src/routes/v1`).

Conventions:

- Wrap controllers in `catchAsync` and throw `ApiError(status, message)`; the
  error middleware responds with `{ code, message }` (plus the stack in
  development and test).
- Validate requests with `validate(schema)` from `src/validations`.
- `auth()` requires a Bearer JWT; `auth("right")` also checks the role rights in
  `src/config/roles.ts`. Access tokens last `JWT_ACCESS_EXPIRATION_MINUTES`,
  refresh tokens `JWT_REFRESH_EXPIRATION_DAYS` (`POST /v1/auth/refresh-tokens`).
- Log with the Winston logger in `src/config/logger.ts` (`NODE_DEBUG_LEVEL`);
  requests are logged by morgan.

## Donations

Donate Bitcoin at [jfrader.com/tips](https://jfrader.com/tips)

Based on [prisma-express-typescript-boilerplate](https://github.com/antonio-lazaro/prisma-express-typescript-boilerplate). License: [MIT](LICENSE).
