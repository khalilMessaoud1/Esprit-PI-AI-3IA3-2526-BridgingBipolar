-- CreateTable
CREATE TABLE "CompanionThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanionThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanionMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanionThread_userId_idx" ON "CompanionThread"("userId");

-- CreateIndex
CREATE INDEX "CompanionMessage_threadId_idx" ON "CompanionMessage"("threadId");

-- AddForeignKey
ALTER TABLE "CompanionThread" ADD CONSTRAINT "CompanionThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanionMessage" ADD CONSTRAINT "CompanionMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CompanionThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
