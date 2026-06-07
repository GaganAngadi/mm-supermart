import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const purchaseRouter = Router();

const purchaseSchema = z.object({
  supplierId: z.string(),
  branchId: z.string(),
  invoiceUrl: z.string().optional(),
  paidAmount: z.number().nonnegative().default(0),
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative(),
    gstRate: z.number().nonnegative().default(0)
  })).min(1)
});

purchaseRouter.get("/", requireAuth, async (_req, res) => {
  res.json(await prisma.purchase.findMany({ include: { supplier: true, items: true }, orderBy: { createdAt: "desc" }, take: 50 }));
});

purchaseRouter.post("/", requireAuth, requireRole(["Super Admin", "Manager", "Inventory Staff"]), async (req, res, next) => {
  try {
    const input = purchaseSchema.parse(req.body);
    const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const tax = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost * (item.gstRate / 100), 0);
    const purchase = await prisma.purchase.create({
      data: {
        purchaseNo: `PUR-${Date.now()}`,
        supplierId: input.supplierId,
        branchId: input.branchId,
        invoiceUrl: input.invoiceUrl,
        subtotal,
        tax,
        total: subtotal + tax,
        paidAmount: input.paidAmount,
        items: {
          create: input.items.map((item) => ({
            ...item,
            total: item.quantity * item.unitCost * (1 + item.gstRate / 100)
          }))
        }
      },
      include: { items: true }
    });
    res.status(201).json(purchase);
  } catch (error) {
    next(error);
  }
});
