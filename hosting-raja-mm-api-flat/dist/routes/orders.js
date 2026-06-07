import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
export const orderRouter = Router();
const orderSchema = z.object({
    customerId: z.string().optional(),
    branchId: z.string(),
    paymentMethod: z.enum(["CASH", "CARD", "UPI", "CREDIT"]),
    discount: z.number().nonnegative().default(0),
    items: z.array(z.object({ productId: z.string(), quantity: z.number().positive(), unitPrice: z.number().nonnegative(), gstRate: z.number().nonnegative() })).min(1)
});
orderRouter.post("/", requireAuth, async (req, res, next) => {
    try {
        const input = orderSchema.parse(req.body);
        if (req.user?.shopId) {
            const branch = await prisma.branch.findFirst({ where: { id: input.branchId, shopId: req.user.shopId } });
            if (!branch)
                return res.status(403).json({ message: "Branch does not belong to this shop" });
            const productCount = await prisma.product.count({
                where: { shopId: req.user.shopId, id: { in: input.items.map((item) => item.productId) } }
            });
            if (productCount !== input.items.length)
                return res.status(403).json({ message: "One or more products do not belong to this shop" });
        }
        const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const tax = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice * (item.gstRate / 100), 0);
        const total = subtotal + tax - input.discount;
        const order = await prisma.order.create({
            data: {
                invoiceNo: `INV-${Date.now()}`,
                branchId: input.branchId,
                customerId: input.customerId,
                subtotal,
                tax,
                discount: input.discount,
                total,
                status: "PAID",
                items: { create: input.items },
                payments: { create: { method: input.paymentMethod, amount: total, status: "PAID" } }
            },
            include: { items: true, payments: true }
        });
        return res.status(201).json(order);
    }
    catch (error) {
        return next(error);
    }
});
