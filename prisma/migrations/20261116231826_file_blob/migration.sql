-- CreateTable
CREATE TABLE "FileBlob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileBlob_key_key" ON "FileBlob"("key");

-- CreateIndex
CREATE INDEX "FileBlob_key_idx" ON "FileBlob"("key");
