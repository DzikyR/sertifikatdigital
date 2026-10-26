-- CreateTable
CREATE TABLE "EventLogo" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "imagePath" VARCHAR(255) NOT NULL,
    "posX" INTEGER NOT NULL DEFAULT 0,
    "posY" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 200,
    "height" INTEGER NOT NULL DEFAULT 200,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventLogo_eventId_idx" ON "EventLogo"("eventId");

-- AddForeignKey
ALTER TABLE "EventLogo" ADD CONSTRAINT "EventLogo_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
