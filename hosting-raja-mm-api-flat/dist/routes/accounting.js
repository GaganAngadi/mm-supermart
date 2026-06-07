import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
export const accountingRouter = Router();
const estimateSchema = z.object({
    customerId: z.string().optional(),
    branchId: z.string(),
    validUntil: z.coerce.date().optional(),
    notes: z.string().optional(),
    subtotal: z.number().nonnegative(),
    tax: z.number().nonnegative().default(0),
    discount: z.number().nonnegative().default(0),
    total: z.number().nonnegative()
});
const ledgerEntrySchema = z.object({
    accountName: z.string().min(2),
    accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "RECEIVABLE", "PAYABLE", "TAX", "CASH", "BANK"]),
    description: z.string().optional(),
    debit: z.coerce.number().nonnegative().default(0),
    credit: z.coerce.number().nonnegative().default(0),
    reference: z.string().optional(),
    date: z.coerce.date().optional()
}).refine((input) => input.debit > 0 || input.credit > 0, { message: "Enter debit or credit amount" });
const expenseSchema = z.object({
    category: z.string().min(2),
    vendor: z.string().optional(),
    amount: z.coerce.number().positive(),
    gstRate: z.coerce.number().min(0).max(100).default(0),
    paymentMode: z.string().min(2),
    notes: z.string().optional(),
    date: z.coerce.date().optional()
});
const bankAccountSchema = z.object({
    name: z.string().min(2),
    type: z.enum(["CASH", "BANK"]),
    accountNumber: z.string().optional(),
    ifsc: z.string().optional(),
    openingBalance: z.coerce.number().default(0),
    currentBalance: z.coerce.number().default(0)
});
accountingRouter.get("/summary", requireAuth, async (_req, res) => {
    const [receivables, payables, expenses, gst, ledgerTotals, bankAccounts, recentLedger, recentExpenses] = await Promise.all([
        prisma.ledgerEntry.aggregate({ _sum: { debit: true }, where: { accountType: "RECEIVABLE" } }),
        prisma.ledgerEntry.aggregate({ _sum: { credit: true }, where: { accountType: "PAYABLE" } }),
        prisma.expense.aggregate({ _sum: { amount: true } }),
        prisma.ledgerEntry.aggregate({ _sum: { credit: true }, where: { accountType: "TAX" } }),
        prisma.ledgerEntry.aggregate({ _sum: { debit: true, credit: true } }),
        prisma.bankAccount.findMany({ orderBy: { name: "asc" } }),
        prisma.ledgerEntry.findMany({ orderBy: { date: "desc" }, take: 8 }),
        prisma.expense.findMany({ orderBy: { date: "desc" }, take: 8 })
    ]);
    res.json({
        receivables: receivables._sum.debit ?? 0,
        payables: payables._sum.credit ?? 0,
        expenses: expenses._sum.amount ?? 0,
        gstLiability: gst._sum.credit ?? 0,
        totalDebit: ledgerTotals._sum.debit ?? 0,
        totalCredit: ledgerTotals._sum.credit ?? 0,
        bankAccounts,
        recentLedger,
        recentExpenses
    });
});
accountingRouter.get("/ledger", requireAuth, async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const take = Math.min(Number(req.query.take ?? 20), 100);
    const [data, total] = await Promise.all([
        prisma.ledgerEntry.findMany({ orderBy: { date: "desc" }, skip: (page - 1) * take, take }),
        prisma.ledgerEntry.count()
    ]);
    res.json({ data, meta: { page, take, total } });
});
accountingRouter.post("/ledger", requireAuth, async (req, res, next) => {
    try {
        const input = ledgerEntrySchema.parse(req.body);
        const ledgerEntry = await prisma.ledgerEntry.create({ data: input });
        return res.status(201).json(ledgerEntry);
    }
    catch (error) {
        return next(error);
    }
});
accountingRouter.get("/expenses", requireAuth, async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const take = Math.min(Number(req.query.take ?? 20), 100);
    const [data, total] = await Promise.all([
        prisma.expense.findMany({ orderBy: { date: "desc" }, skip: (page - 1) * take, take }),
        prisma.expense.count()
    ]);
    res.json({ data, meta: { page, take, total } });
});
accountingRouter.post("/expenses", requireAuth, async (req, res, next) => {
    try {
        const input = expenseSchema.parse(req.body);
        const expense = await prisma.$transaction(async (tx) => {
            const saved = await tx.expense.create({ data: input });
            await tx.ledgerEntry.create({
                data: {
                    date: saved.date,
                    accountName: input.category,
                    accountType: "EXPENSE",
                    description: `${input.vendor ? `${input.vendor} - ` : ""}${input.notes ?? "Expense recorded"}`,
                    debit: input.amount,
                    reference: `EXP-${saved.id}`
                }
            });
            return saved;
        });
        return res.status(201).json(expense);
    }
    catch (error) {
        return next(error);
    }
});
accountingRouter.get("/bank-accounts", requireAuth, async (_req, res) => {
    const accounts = await prisma.bankAccount.findMany({ orderBy: { name: "asc" } });
    return res.json({ data: accounts });
});
accountingRouter.post("/bank-accounts", requireAuth, async (req, res, next) => {
    try {
        const input = bankAccountSchema.parse(req.body);
        const account = await prisma.bankAccount.create({ data: input });
        return res.status(201).json(account);
    }
    catch (error) {
        return next(error);
    }
});
accountingRouter.post("/estimates", requireAuth, async (req, res, next) => {
    try {
        const input = estimateSchema.parse(req.body);
        const estimate = await prisma.estimate.create({
            data: {
                estimateNo: `EST-${Date.now()}`,
                ...input
            }
        });
        return res.status(201).json(estimate);
    }
    catch (error) {
        return next(error);
    }
});
accountingRouter.post("/payment-reminders", requireAuth, async (req, res) => {
    res.status(202).json({
        message: "Payment reminder queued",
        channel: req.body.channel ?? "WHATSAPP",
        partyId: req.body.partyId,
        amount: req.body.amount
    });
});
