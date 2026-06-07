import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
export const customerRouter = Router();
const customerSchema = z.object({
    name: z.string().min(2),
    mobile: z.string().min(7),
    email: z.string().email().optional(),
    address: z.string().optional()
});
customerRouter.get("/", requireAuth, async (req, res) => {
    const search = String(req.query.search ?? "");
    const customers = await prisma.customer.findMany({
        where: {
            ...(req.user?.shopId ? { shopId: req.user.shopId } : {}),
            ...(search ? { OR: [{ name: { contains: search } }, { mobile: { contains: search } }] } : {})
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(Number(req.query.take ?? 50), 100)
    });
    res.json(customers);
});
customerRouter.post("/", requireAuth, async (req, res, next) => {
    try {
        const input = customerSchema.parse(req.body);
        const existing = await prisma.customer.findFirst({ where: { mobile: input.mobile, shopId: req.user?.shopId } });
        const customer = existing
            ? await prisma.customer.update({ where: { id: existing.id }, data: input })
            : await prisma.customer.create({ data: { ...input, shopId: req.user?.shopId } });
        res.status(201).json(customer);
    }
    catch (error) {
        next(error);
    }
});
