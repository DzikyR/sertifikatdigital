-- AlterTable
ALTER TABLE "EventSignature" ADD COLUMN     "librarySignatureId" TEXT;

-- CreateTable
CREATE TABLE "signature_library" (
    "id" TEXT NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "signerName" VARCHAR(150),
    "signerTitle" VARCHAR(150),
    "imagePath" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hmpAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_library_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventSignature_librarySignatureId_idx" ON "EventSignature"("librarySignatureId");

-- AddForeignKey
ALTER TABLE "signature_library" ADD CONSTRAINT "signature_library_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSignature" ADD CONSTRAINT "EventSignature_librarySignatureId_fkey" FOREIGN KEY ("librarySignatureId") REFERENCES "signature_library"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: TTD yang sudah ada di event dipindahkan ke pustaka (dikelola Kaprodi/Admin Prodi)
INSERT INTO "signature_library" ("id", "label", "signerName", "signerTitle", "imagePath", "isActive", "hmpAllowed", "createdById", "createdAt", "updatedAt")
SELECT 'lib' || s."id", s."label", s."signerName", s."signerTitle", s."imagePath", true, true, e."createdById", s."createdAt", CURRENT_TIMESTAMP
FROM "EventSignature" s JOIN "Event" e ON e."id" = s."eventId";

UPDATE "EventSignature" SET "librarySignatureId" = 'lib' || "id";
