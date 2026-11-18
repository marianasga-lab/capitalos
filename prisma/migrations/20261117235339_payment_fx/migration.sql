-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReimbursementPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "fxToMXN" DECIMAL NOT NULL DEFAULT 1,
    "counterpartyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReimbursementPayment_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReimbursementPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReimbursementPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReimbursementPayment" ("accountId", "amount", "counterpartyId", "createdAt", "date", "id", "notes", "transactionId") SELECT "accountId", "amount", "counterpartyId", "createdAt", "date", "id", "notes", "transactionId" FROM "ReimbursementPayment";
DROP TABLE "ReimbursementPayment";
ALTER TABLE "new_ReimbursementPayment" RENAME TO "ReimbursementPayment";
CREATE INDEX "ReimbursementPayment_counterpartyId_date_idx" ON "ReimbursementPayment"("counterpartyId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
