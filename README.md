# Lightning Accounts

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

## Table of Contents

- [Commands](#commands)
- [npm Releases](#npm-releases)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Error Handling](#error-handling)
- [Validation](#validation)
- [Authentication](#authentication)
- [Authorization](#authorization)
- [Logging](#logging)
- [Linting](#linting)
- [Stack](#stack)
- [Contributing](#contributing)

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

Linting:

```bash
# run ESLint
yarn lint

# fix ESLint errors
yarn lint:fix

# run prettier
yarn prettier

# fix prettier errors
yarn prettier:fix
```

## npm Releases

Public npm releases use GitHub Actions trusted publishing and a committed,
reviewed package artifact. The workflow verifies the exact package identity,
SHA-256, and npm integrity before it can publish; no long-lived npm write token
is stored in GitHub.

See the
[npm release process](https://github.com/jfrader/lightning-accounts/blob/master/RELEASING.md)
for the npm configuration and release steps.

## Environment Variables

The environment variables can be found and modified in the `.env` file. They come with these default values:

Check `.env.example` file

## Reverse Proxy (nginx)

If you run behind nginx, you must trust the proxy so Express derives `req.ip` and `req.secure` from
`X-Forwarded-*` headers. Set `NODE_TRUSTED_PROXY_IP` to the nginx IP or CIDR (comma-separated).

Example nginx snippet:

```nginx
location / {
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_pass http://127.0.0.1:2999;
}
```

## Docker Builds

The image build runs the Swagger generation scripts, and those import the app config. Because of
that, the Docker build injects minimal build-time values for `DATABASE_URL`, `NODE_ORIGIN`,
`JWT_SECRET`, `JWT_BASE64_PUBLIC_KEY`, `JWT_BASE64_PRIVATE_KEY`, and `SEED_HASH_SECRET`.

`Dockerfile` is now the dev/test image and installs dev dependencies, which is required for
`nodemon`, `jest`, and TypeScript builds in local Docker workflows.

`Dockerfile.prod` is the production image used by `docker-compose.prod.yml`.

`yarn docker:staging` and `yarn docker:prod` build the replacement server image before Compose
recreates any running containers. A failed build therefore leaves the currently running version
in place. These commands intentionally do not run `docker compose down`.

Runtime behavior is unchanged: the container still reads real values from `.env` via
`docker-compose`, and the build-time defaults are only there to let code generation run.

## Project Structure

```
src\
 |--config\         # Environment variables and configuration related things
 |--controllers\    # Route controllers (controller layer)
 |--docs\           # Swagger files
 |--middlewares\    # Custom express middlewares
 |--models\         # Mongoose models (data layer)
 |--routes\         # Routes
 |--services\       # Business logic (service layer)
 |--utils\          # Utility classes and functions
 |--validations\    # Request data validation schemas
 |--app.js          # Express app
 |--index.js        # App entry point
```

## API Documentation

To view the list of available APIs and their specifications, run the server and go to `http://localhost:3000/v1/docs` in your browser. This documentation page is automatically generated using the [swagger](https://swagger.io/) definitions written as comments in the route files.

### API Endpoints

List of available routes:

**Auth routes**:\
`POST /v1/auth/register` - register\
`POST /v1/auth/login` - login\
`POST /v1/auth/me` - profile\
`POST /v1/auth/refresh-tokens` - refresh auth tokens\
`POST /v1/auth/forgot-password` - send reset password email\
`POST /v1/auth/reset-password` - reset password\
`POST /v1/auth/send-verification-email` - send verification email\
`POST /v1/auth/verify-email` - verify email

**User routes**:\
`POST /v1/users` - create a user\
`GET /v1/users` - get all users\
`GET /v1/users/:userId` - get user\
`PATCH /v1/users/:userId` - update user\
`DELETE /v1/users/:userId` - delete user

## Error Handling

The app has a centralized error handling mechanism.

Controllers should try to catch the errors and forward them to the error handling middleware (by calling `next(error)`). For convenience, you can also wrap the controller inside the catchAsync utility wrapper, which forwards the error.

```javascript
const catchAsync = require("../utils/catchAsync")

const controller = catchAsync(async (req, res) => {
  // this error will be forwarded to the error handling middleware
  throw new Error("Something wrong happened")
})
```

The error handling middleware sends an error response, which has the following format:

```json
{
  "code": 404,
  "message": "Not found"
}
```

When running in development mode, the error response also contains the error stack.

The app has a utility ApiError class to which you can attach a response code and a message, and then throw it from anywhere (catchAsync will catch it).

For example, if you are trying to get a user from the DB who is not found, and you want to send a 404 error, the code should look something like:

```javascript
const httpStatus = require("http-status")
const ApiError = require("../utils/ApiError")
const User = require("../models/User")

const getUser = async (userId) => {
  const user = await User.findById(userId)
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found")
  }
}
```

## Validation

Request data is validated using [Joi](https://joi.dev/). Check the [documentation](https://joi.dev/api/) for more details on how to write Joi validation schemas.

The validation schemas are defined in the `src/validations` directory and are used in the routes by providing them as parameters to the `validate` middleware.

```javascript
const express = require("express")
const validate = require("../../middlewares/validate")
const userValidation = require("../../validations/user.validation")
const userController = require("../../controllers/user.controller")

const router = express.Router()

router.post("/users", validate(userValidation.createUser), userController.createUser)
```

## Authentication

To require authentication for certain routes, you can use the `auth` middleware.

```javascript
const express = require("express")
const auth = require("../../middlewares/auth")
const userController = require("../../controllers/user.controller")

const router = express.Router()

router.post("/users", auth(), userController.createUser)
```

These routes require a valid JWT access token in the Authorization request header using the Bearer schema. If the request does not contain a valid access token, an Unauthorized (401) error is thrown.

**Generating Access Tokens**:

An access token can be generated by making a successful call to the register (`POST /v1/auth/register`) or login (`POST /v1/auth/login`) endpoints. The response of these endpoints also contains refresh tokens (explained below).

An access token is valid for 30 minutes. You can modify this expiration time by changing the `JWT_ACCESS_EXPIRATION_MINUTES` environment variable in the .env file.

**Refreshing Access Tokens**:

After the access token expires, a new access token can be generated, by making a call to the refresh token endpoint (`POST /v1/auth/refresh-tokens`) and sending along a valid refresh token in the request body. This call returns a new access token and a new refresh token.

A refresh token is valid for 30 days. You can modify this expiration time by changing the `JWT_REFRESH_EXPIRATION_DAYS` environment variable in the .env file.

## Authorization

The `auth` middleware can also be used to require certain rights/permissions to access a route.

```javascript
const express = require("express")
const auth = require("../../middlewares/auth")
const userController = require("../../controllers/user.controller")

const router = express.Router()

router.post("/users", auth("manageUsers"), userController.createUser)
```

In the example above, an authenticated user can access this route only if that user has the `manageUsers` permission.

The permissions are role-based. You can view the permissions/rights of each role in the `src/config/roles.js` file.

If the user making the request does not have the required permissions to access this route, a Forbidden (403) error is thrown.

## Logging

Import the logger from `src/config/logger.js`. It is using the [Winston](https://github.com/winstonjs/winston) logging library.

Set the NODE_DEBUG_LEVEL environment variable

Logging should be done according to the following severity levels (ascending order from most important to least important):

```javascript
const logger = require("<path to src>/config/logger")

logger.error("message") // level 0
logger.warn("message") // level 1
logger.info("message") // level 2
logger.http("message") // level 3
logger.verbose("message") // level 4
logger.debug("message") // level 5
```

Note: API request information (request url, response code, timestamp, etc.) are also automatically logged (using [morgan](https://github.com/expressjs/morgan)).

# Donations

Donate Bitcoin at [jfrader.com/tips](https://jfrader.com/tips)

## Inspirations

Based off this boilerplate https://github.com/antonio-lazaro/prisma-express-typescript-boilerplate

## License

[MIT](LICENSE)
