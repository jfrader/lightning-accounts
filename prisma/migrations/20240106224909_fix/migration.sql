/*
  Warnings:

  - You are about to drop the column `transactionId` on the `PayRequest` table. All the data in the column will be lost.
  - You are about to drop the column `valueInSats` on the `Transaction` table. All the data in the column will be lost.
  - Added the required column `amountInSats` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PayRequest" DROP CONSTRAINT "PayRequest_transactionId_fkey";

-- DropIndex
DROP INDEX "PayRequest_transactionId_key";

-- AlterTable
ALTER TABLE "PayRequest" DROP COLUMN "transactionId";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "valueInSats",
ADD COLUMN     "amountInSats" INTEGER NOT NULL,
ADD COLUMN     "payRequestId" INTEGER,
ALTER COLUMN "invoiceSettled" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payRequestId_fkey" FOREIGN KEY ("payRequestId") REFERENCES "PayRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
