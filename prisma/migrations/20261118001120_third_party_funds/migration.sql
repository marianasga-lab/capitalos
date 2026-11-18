-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "expectedAmount" DECIMAL,
    "balance" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fund_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fundSource" TEXT NOT NULL DEFAULT 'OWN_CAPITAL',
    "isFixedExpense" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "fxToMXN" DECIMAL NOT NULL DEFAULT 1,
    "counterpartyId" TEXT,
    "fundId" TEXT,
    "myShareAmount" DECIMAL,
    "accountId" TEXT,
    "toAmount" DECIMAL,
    "toAccountId" TEXT,
    "creditCardId" TEXT,
    "reimbursementStatus" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "amountReimbursed" DECIMAL NOT NULL DEFAULT 0,
    "reimbursedAt" DATETIME,
    "reimbursedToId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_reimbursedToId_fkey" FOREIGN KEY ("reimbursedToId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "amountReimbursed", "category", "counterpartyId", "createdAt", "creditCardId", "currency", "date", "description", "fundSource", "fxToMXN", "id", "isFixedExpense", "myShareAmount", "notes", "reimbursedAt", "reimbursedToId", "reimbursementStatus", "toAccountId", "toAmount", "type", "updatedAt") SELECT "accountId", "amount", "amountReimbursed", "category", "counterpartyId", "createdAt", "creditCardId", "currency", "date", "description", "fundSource", "fxToMXN", "id", "isFixedExpense", "myShareAmount", "notes", "reimbursedAt", "reimbursedToId", "reimbursementStatus", "toAccountId", "toAmount", "type", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");
CREATE INDEX "Transaction_creditCardId_date_idx" ON "Transaction"("creditCardId", "date");
CREATE INDEX "Transaction_reimbursementStatus_idx" ON "Transaction"("reimbursementStatus");
CREATE INDEX "Transaction_counterpartyId_idx" ON "Transaction"("counterpartyId");
CREATE INDEX "Transaction_category_date_idx" ON "Transaction"("category", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Fund_counterpartyId_status_idx" ON "Fund"("counterpartyId", "status");
