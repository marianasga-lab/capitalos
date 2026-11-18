-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'DEBIT', 'INVESTMENT', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('MXN', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'REIMBURSABLE_EXPENSE', 'FUND_DEPOSIT', 'FUND_PAYMENT');

-- CreateEnum
CREATE TYPE "FundStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FundSource" AS ENUM ('OWN_CAPITAL', 'ALLOWANCE_FAMILY', 'SHARED_SPLIT');

-- CreateEnum
CREATE TYPE "ReimbursementStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'MXN',
    "currentBalance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "interestRate" DECIMAL(9,6),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "limit" DECIMAL(16,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'MXN',
    "cutoffDay" INTEGER NOT NULL,
    "paymentDueDay" INTEGER NOT NULL,
    "interestRate" DECIMAL(9,6) NOT NULL,
    "currentBalance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "fundSource" "FundSource" NOT NULL DEFAULT 'OWN_CAPITAL',
    "isFixedExpense" BOOLEAN NOT NULL DEFAULT false,
    "currency" "Currency" NOT NULL DEFAULT 'MXN',
    "fxToMXN" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "counterpartyId" TEXT,
    "fundId" TEXT,
    "myShareAmount" DECIMAL(16,2),
    "accountId" TEXT,
    "toAmount" DECIMAL(16,2),
    "toAccountId" TEXT,
    "creditCardId" TEXT,
    "reimbursementStatus" "ReimbursementStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "amountReimbursed" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "reimbursedAt" TIMESTAMP(3),
    "reimbursedToId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counterparty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isFamily" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "expectedAmount" DECIMAL(16,2),
    "balance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "status" "FundStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReimbursementPayment" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "fxToMXN" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "counterpartyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReimbursementPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "defaultBudget" DECIMAL(16,2),
    "defaultFundSource" "FundSource" NOT NULL DEFAULT 'OWN_CAPITAL',
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "plannedAmount" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(16,2) NOT NULL,
    "currentAmount" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlySnapshot" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "totalAssets" DECIMAL(16,2) NOT NULL,
    "totalLiabilities" DECIMAL(16,2) NOT NULL,
    "netWorth" DECIMAL(16,2) NOT NULL,
    "savingsRate" DECIMAL(12,6) NOT NULL,
    "totalIncome" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "totalExpenses" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "currency" "Currency" NOT NULL,
    "rateToMXN" DECIMAL(14,6) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_creditCardId_date_idx" ON "Transaction"("creditCardId", "date");

-- CreateIndex
CREATE INDEX "Transaction_reimbursementStatus_idx" ON "Transaction"("reimbursementStatus");

-- CreateIndex
CREATE INDEX "Transaction_counterpartyId_idx" ON "Transaction"("counterpartyId");

-- CreateIndex
CREATE INDEX "Transaction_category_date_idx" ON "Transaction"("category", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Counterparty_name_key" ON "Counterparty"("name");

-- CreateIndex
CREATE INDEX "Fund_counterpartyId_status_idx" ON "Fund"("counterpartyId", "status");

-- CreateIndex
CREATE INDEX "ReimbursementPayment_counterpartyId_date_idx" ON "ReimbursementPayment"("counterpartyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_kind_key" ON "Category"("name", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_categoryId_year_month_key" ON "Budget"("categoryId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySnapshot_year_month_key" ON "MonthlySnapshot"("year", "month");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reimbursedToId_fkey" FOREIGN KEY ("reimbursedToId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementPayment" ADD CONSTRAINT "ReimbursementPayment_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementPayment" ADD CONSTRAINT "ReimbursementPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementPayment" ADD CONSTRAINT "ReimbursementPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
