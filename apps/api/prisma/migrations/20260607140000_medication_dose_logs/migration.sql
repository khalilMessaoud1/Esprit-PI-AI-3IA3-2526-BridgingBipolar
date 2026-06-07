-- CreateEnum
CREATE TYPE "MedicationDoseStatus" AS ENUM ('TAKEN', 'MISSED');

-- CreateTable
CREATE TABLE "MedicationDoseLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "scheduledDate" TEXT NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "status" "MedicationDoseStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationDoseLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicationDoseLog_userId_scheduledDate_idx" ON "MedicationDoseLog"("userId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationDoseLog_userId_medicationId_scheduledDate_scheduledTime_key" ON "MedicationDoseLog"("userId", "medicationId", "scheduledDate", "scheduledTime");

-- AddForeignKey
ALTER TABLE "MedicationDoseLog" ADD CONSTRAINT "MedicationDoseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDoseLog" ADD CONSTRAINT "MedicationDoseLog_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
