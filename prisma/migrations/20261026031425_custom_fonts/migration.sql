-- CreateTable
CREATE TABLE "custom_fonts" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "filePath" VARCHAR(255) NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_fonts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "custom_fonts" ADD CONSTRAINT "custom_fonts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
