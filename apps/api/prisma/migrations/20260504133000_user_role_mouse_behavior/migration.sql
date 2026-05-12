-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'RELATIVE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'PATIENT';

-- CreateTable
CREATE TABLE "MouseBehaviorLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "level" TEXT NOT NULL,
    "windowCount" INTEGER NOT NULL,
    "anomalyPct" DOUBLE PRECISION NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouseBehaviorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MouseBehaviorLog_userId_date_key" ON "MouseBehaviorLog"("userId", "date");

-- AddForeignKey
ALTER TABLE "MouseBehaviorLog" ADD CONSTRAINT "MouseBehaviorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
