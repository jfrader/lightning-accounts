-- Revoke all legacy credentials rather than keeping a plaintext compatibility path.
DELETE FROM "Token";
ALTER TABLE "Token" RENAME COLUMN "token" TO "tokenDigest";
CREATE UNIQUE INDEX "Token_tokenDigest_key" ON "Token"("tokenDigest");
