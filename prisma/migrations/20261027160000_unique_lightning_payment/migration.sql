CREATE UNIQUE INDEX "Transaction_lightning_identity_key"
ON "Transaction" ("type", ("invoice"->>'id'))
WHERE "type" IN ('DEPOSIT', 'WITHDRAW');
