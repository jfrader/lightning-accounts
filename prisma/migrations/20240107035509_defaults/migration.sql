-- AlterTable
ALTER TABLE "PayRequest" ALTER COLUMN "description" SET DEFAULT '',
ALTER COLUMN "paid" SET DEFAULT false;

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "walletImpacted" SET DEFAULT false;

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "disabled" SET DEFAULT false;
