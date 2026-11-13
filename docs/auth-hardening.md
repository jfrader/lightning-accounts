# Authentication security rollout

Deploy the token migration and application together, with old instances stopped.
The migration deletes all existing token rows before renaming `token` to
`tokenDigest`. Existing refresh sessions, magic links, verification links and reset
links are invalidated. Users must sign in again and request new links. There is no
plaintext fallback. New stored tokens are SHA-256 digests of random, signed JWTs;
the JWT is returned only to the client. Refresh and magic-link consumption retain
their conditional single-use database operations.

Rotate the JWT RSA key pair anywhere the published `.env.test` key was used.
Verify each deployment independently: testnet currently signs with a different
pair, so it needs no rotation for this reason. Remove the old pair from
deployment secrets and invalidate existing sessions. Production and testnet hosts reject its public-key SHA-256
SPKI fingerprint. Rotate any SMTP credentials or LND macaroon copied from that
file as well. Removing them from the current tree does not remove Git history.
Purge retained access logs containing magic links according to retention policy.

Authentication requests are limited by IP, regardless of cookie contents. Login,
registration, magic-link requests and password-reset requests additionally share
a five-request, fifteen-minute bucket per trimmed, lowercased recipient. Failures
count. Proxy configuration determines the client IP; trusted proxies do not bypass
limits. No Redis support exists in this repository: both limits use process-local
express-rate-limit MemoryStore and reset at restart. Run one API instance until a
shared store is configured; multiple instances multiply the effective limits.

Access logs omit query strings and fragments in every environment. Error response
messages are not interpolated into access logs.

Logout revokes all stored refresh, magic-link, reset and verification credentials
for the refresh token's user. Password and email changes and password reset use
the same revocation policy. Already-issued access JWTs remain valid until expiry.

`DOCS_ENABLED=0` disables `/v1/docs`. It defaults off in production and on in
development/test. Enabling production docs requires authenticated admin-level
`users_write` permission.

Seeds are development/test only. Set `SEED_APP_EMAIL`, `SEED_APP_PASSWORD`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` and `SEED_E2E_PASSWORD` explicitly before
running `yarn prisma db seed`. Startup migration commands never seed. Jest creates
ephemeral RSA keys; standalone test servers need locally generated keys in their
environment. Do not reuse local test credentials or keys in deployed environments.

Unauthenticated magic-link login still creates missing accounts. Whether to keep
that product behavior is a separate decision.
