ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" VARCHAR(200),
ADD COLUMN "payoutReceiverId" INTEGER;

CREATE UNIQUE INDEX "Transaction_walletId_idempotencyKey_key"
ON "Transaction"("walletId", "idempotencyKey");
