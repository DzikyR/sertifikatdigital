-- CreateTable
CREATE TABLE "feature_settings" (
    "key" VARCHAR(60) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_settings_pkey" PRIMARY KEY ("key","role")
);
