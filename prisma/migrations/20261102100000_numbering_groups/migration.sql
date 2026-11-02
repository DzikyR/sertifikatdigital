-- Grup penomoran: beberapa event berbagi satu counter nomor sertifikat
CREATE TABLE "numbering_groups" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "numbering_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Event" ADD COLUMN "numberingGroupId" TEXT;
CREATE INDEX "Event_numberingGroupId_idx" ON "Event"("numberingGroupId");
ALTER TABLE "Event" ADD CONSTRAINT "Event_numberingGroupId_fkey"
    FOREIGN KEY ("numberingGroupId") REFERENCES "numbering_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nomor urut per sertifikat. Sertifikat lama: diambil dari nomor yang sudah tercetak,
-- dengan mengubah format event menjadi regex. Nomor sertifikat sendiri tidak berubah.
ALTER TABLE "Certificate" ADD COLUMN "seqNo" INTEGER;

UPDATE "Certificate" c
SET "seqNo" = substring(c."certificateNumber" FROM p.pattern)::integer
FROM (
    SELECT e."id",
           '^' || replace(replace(
             regexp_replace(
               replace(replace(replace(replace(
                 replace(e."certNumberFormat", '.', '\.'),
                 '{YYYY}', '\d\d\d\d'), '{MM}', '\d\d'), '{ROMAN_MM}', '[IVX]+'), '{EID}', '[A-Z0-9]+'),
               '\{SEQ(:\d)?\}', '(\\d+)', 'g'),
             '{', '\{'), '}', '\}') || '$' AS pattern
    FROM "Event" e
) p
WHERE p."id" = c."eventId";

-- Jaring pengaman bila ada nomor yang tidak cocok dengan formatnya: urutan di dalam event
UPDATE "Certificate" c
SET "seqNo" = r.rn
FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "eventId" ORDER BY "certificateNumber") AS rn
    FROM "Certificate"
) r
WHERE r."id" = c."id" AND c."seqNo" IS NULL;

ALTER TABLE "Certificate" ALTER COLUMN "seqNo" SET NOT NULL;
