import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const supplierRouter = Router();

const supplierSchema = z.object({
  name: z.string().min(2),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  gstin: z.string().optional()
});

supplierRouter.get("/", requireAuth, async (_req, res) => {
  res.json(await prisma.supplier.findMany({ orderBy: { createdAt: "desc" }, take: 100 }));
});

supplierRouter.post("/", requireAuth, requireRole(["Super Admin", "Manager", "Inventory Staff"]), async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.create({ data: supplierSchema.parse(req.body) });
    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
});
