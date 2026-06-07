-- CreateTable
CREATE TABLE "CompanionCrisisAlert" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "relativeId" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanionCrisisAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanionCrisisAlert_relativeId_readAt_idx" ON "CompanionCrisisAlert"("relativeId", "readAt");

-- CreateIndex
CREATE INDEX "CompanionCrisisAlert_patientId_createdAt_idx" ON "CompanionCrisisAlert"("patientId", "createdAt");
