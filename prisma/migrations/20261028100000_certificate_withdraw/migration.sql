-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawNote" VARCHAR(300);
