# Authentication security rollout

Deploy the token migration and application together. The migration deletes all
existing token rows before renaming `token` to `tokenDigest`, so it is one-way:
the previous image cannot serve against the migrated schema. Existing refresh
sessions, magic links, verification links and reset links are invalidated. Users
must sign in again and request new links. There is no plaintext fallback. New
stored tokens are SHA-256 digests of random, signed JWTs; the JWT is returned
only to the client. Refresh and magic-link consumption retain their conditional
single-use database operations.

On Render the pre-deploy command applies the migration while the previous
version still serves traffic. Expect roughly 30 seconds to 2 minutes of 500s on
auth routes between the rename and the new instance passing `/health/ready`,
because the old code still reads and writes the `token` column. Schedule the
deploy accordingly. A code-only rollback does not restore the schema; rolling
back requires the previous image plus
`ALTER TABLE "Token" RENAME COLUMN "tokenDigest" TO "token"` and
`DROP INDEX "Token_tokenDigest_key"`, and it loses every token issued since the
migration. Prefer rolling forward.

Rotate the JWT RSA key pair anywhere the published `.env.test` key was used.
Verify each deployment independently: production and testnet currently sign with
different pairs, so neither needs rotation for this reason. Remove the old pair
from deployment secrets and invalidate existing sessions. Deployed environments
reject the published public-key SHA-256 SPKI fingerprint at boot; the testnet
check also matches a `.testnet.` `NODE_HOST`. Rotate any SMTP credentials or LND
macaroon copied from that file as well. Removing them from the current tree does
not remove Git history. Purge retained access logs containing magic links
according to retention policy.

Credential endpoints (register, login, magic-link, seed login, reset, verify) are
limited by source IP, so a client-supplied cookie cannot create a fresh bucket.
Authenticated traffic is limited per access/refresh bearer, falling back to IP,
so unrelated users behind one NAT do not share a bucket. Login, registration,
magic-link requests and password-reset requests additionally share a
five-request, fifteen-minute bucket per trimmed, lowercased recipient. Failures
count. Proxy configuration determines the client IP; trusted proxies do not
bypass limits. No Redis support exists in this repository: both limits use
process-local express-rate-limit MemoryStore and reset at restart. Run one API
instance until a shared store is configured; multiple instances multiply the
effective limits.

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
