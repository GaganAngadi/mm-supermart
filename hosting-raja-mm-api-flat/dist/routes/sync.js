import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireSyncAuth } from "../middleware/auth.js";
export const syncRouter = Router();
const productSyncSchema = z.object({
    id: z.string().optional(),
    sku: z.string().min(1),
    barcode: z.string().optional().nullable(),
    name: z.string().min(1),
    brand: z.string().optional().nullable(),
    unit: z.string().optional(),
    mrp: z.number().nonnegative().default(0),
    sellingPrice: z.number().nonnegative().default(0),
    selling_price: z.number().nonnegative().optional(),
    purchasePrice: z.number().nonnegative().optional(),
    purchase_price: z.number().nonnegative().optional(),
    costPrice: z.number().nonnegative().optional(),
    gstRate: z.number().min(0).max(28).default(0),
    gst_rate: z.number().min(0).max(28).optional(),
    category: z.string().optional(),
    imageUrl: z.string().optional().nullable(),
    image_url: z.string().optional().nullable(),
    lowStockThreshold: z.number().int().nonnegative().default(10)
});
const customerSyncSchema = z.object({
    id: z.string().optional(),
    name: z.string().min(1).default("Walk-in Customer"),
    mobile: z.string().optional().nullable(),
    loyaltyPoints: z.number().default(0),
    creditBalance: z.number().default(0)
});
const inventorySyncSchema = z.object({
    sku: z.string().min(1),
    barcode: z.string().optional().nullable(),
    quantity: z.number(),
    movementType: z.string().default("Adjustment"),
    reference: z.string().optional().nullable(),
    notes: z.string().optional().nullable()
});
const paymentSyncSchema = z.object({
    invoiceNo: z.string().min(1),
    method: z.enum(["Cash", "Card", "UPI", "CASH", "CARD", "UPI"]),
    amount: z.number().nonnegative(),
    reference: z.string().optional().nullable()
});
const offlineSaleSchema = z.object({
    invoiceNo: z.string().min(3),
    createdAt: z.string().datetime(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    customerMobile: z.string().optional(),
    paymentMethod: z.enum(["Cash", "Card", "UPI"]),
    subtotal: z.number().nonnegative(),
    tax: z.number().nonnegative(),
    savings: z.number().nonnegative().default(0),
    profit: z.number().default(0),
    discount: z.number().nonnegative().default(0),
    total: z.number().nonnegative(),
    items: z.array(z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        barcode: z.string().optional(),
        unit: z.string().optional(),
        quantity: z.number().positive(),
        mrp: z.number().nonnegative(),
        sellingPrice: z.number().nonnegative(),
        purchasePrice: z.number().nonnegative().default(0),
        gstRate: z.number().min(0).max(28),
        lineTotal: z.number().nonnegative()
    })).min(1)
});
function paymentMethod(value) {
    if (value === "Cash")
        return "CASH";
    if (value === "Card")
        return "CARD";
    return "UPI";
}
function paymentMethodFlexible(value) {
    if (value === "Cash" || value === "CASH")
        return "CASH";
    if (value === "Card" || value === "CARD")
        return "CARD";
    if (value === "UPI")
        return "UPI";
    return "CASH";
}
async function getDefaultBranch(shopId) {
    const existing = await prisma.branch.findFirst({ where: { shopId }, orderBy: { createdAt: "asc" } });
    if (existing)
        return existing;
    return prisma.branch.create({
        data: {
            shopId,
            name: "M&M SuperMart Main Branch",
            code: "MAIN",
            address: "Main Store"
        }
    });
}
async function getDefaultCategory(shopId, name = "Grocery") {
    const existing = await prisma.category.findFirst({ where: { shopId, name } });
    if (existing)
        return existing;
    return prisma.category.create({ data: { shopId, name } });
}
async function syncProduct(input, shopId) {
    const category = await getDefaultCategory(shopId, input.category || "Grocery");
    const existing = await prisma.product.findFirst({
        where: {
            shopId,
            OR: [
                { sku: input.sku },
                ...(input.barcode ? [{ barcode: input.barcode }] : [])
            ]
        }
    });
    const data = {
        shopId,
        name: input.name,
        sku: input.sku,
        barcode: input.barcode || undefined,
        brand: input.brand || undefined,
        unit: input.unit || "pcs",
        mrp: input.mrp,
        sellingPrice: input.sellingPrice || input.selling_price || input.mrp,
        costPrice: input.purchasePrice || input.purchase_price || input.costPrice || 0,
        gstRate: input.gstRate || input.gst_rate || 0,
        imageUrl: input.imageUrl || input.image_url || undefined,
        lowStockThreshold: input.lowStockThreshold,
        categoryId: category.id
    };
    if (existing)
        return prisma.product.update({ where: { id: existing.id }, data });
    return prisma.product.create({ data });
}
async function syncCustomer(input, shopId) {
    const mobile = input.mobile?.replace(/\D/g, "");
    const existing = mobile ? await prisma.customer.findFirst({ where: { shopId, mobile } }) : input.id ? await prisma.customer.findFirst({ where: { id: input.id, shopId } }) : null;
    const data = {
        shopId,
        name: input.name || "Walk-in Customer",
        mobile: mobile || input.id || `LOCAL-${Date.now()}`,
        loyaltyPoints: Math.trunc(input.loyaltyPoints || 0),
        creditBalance: input.creditBalance || 0
    };
    if (existing)
        return prisma.customer.update({ where: { id: existing.id }, data });
    return prisma.customer.create({ data });
}
async function syncInventory(input, shopId) {
    const branch = await getDefaultBranch(shopId);
    const product = await prisma.product.findFirst({
        where: {
            shopId,
            OR: [
                { sku: input.sku },
                ...(input.barcode ? [{ barcode: input.barcode }] : [])
            ]
        }
    });
    if (!product)
        throw new Error(`Product not found for inventory sync: ${input.sku}`);
    const existingInventory = await prisma.inventory.findUnique({ where: { productId_branchId: { productId: product.id, branchId: branch.id } } });
    const nextQuantity = Math.max(0, (existingInventory?.quantity || 0) + Math.trunc(input.quantity));
    return prisma.inventory.upsert({
        where: { productId_branchId: { productId: product.id, branchId: branch.id } },
        update: { quantity: nextQuantity },
        create: { productId: product.id, branchId: branch.id, quantity: nextQuantity }
    });
}
async function syncPayment(input) {
    const order = await prisma.order.findUnique({ where: { invoiceNo: input.invoiceNo } });
    if (!order)
        throw new Error(`Sale not found for payment sync: ${input.invoiceNo}`);
    const existing = await prisma.payment.findFirst({ where: { orderId: order.id, method: paymentMethodFlexible(input.method), amount: input.amount, reference: input.reference || undefined } });
    if (existing)
        return existing;
    return prisma.payment.create({
        data: {
            orderId: order.id,
            method: paymentMethodFlexible(input.method),
            amount: input.amount,
            reference: input.reference || undefined,
            status: "PAID"
        }
    });
}
async function syncSale(input, shopId) {
    const existingOrder = await prisma.order.findUnique({ where: { invoiceNo: input.invoiceNo }, include: { items: true, payments: true } });
    if (existingOrder)
        return existingOrder;
    const [branch, category] = await Promise.all([getDefaultBranch(shopId), getDefaultCategory(shopId)]);
    return prisma.$transaction(async (tx) => {
        let customerId;
        const mobile = input.customerMobile?.replace(/\D/g, "");
        if (mobile) {
            const existingCustomer = await tx.customer.findFirst({ where: { shopId, mobile } });
            const customer = existingCustomer
                ? await tx.customer.update({ where: { id: existingCustomer.id }, data: { name: input.customerName || existingCustomer.name } })
                : await tx.customer.create({ data: {
                        shopId,
                        name: input.customerName || "Walk-in Customer",
                        mobile
                    } });
            customerId = customer.id;
        }
        const productRows = [];
        for (const item of input.items) {
            const existingProduct = await tx.product.findFirst({
                where: {
                    shopId,
                    OR: [
                        { sku: item.sku },
                        ...(item.barcode ? [{ barcode: item.barcode }] : [])
                    ]
                }
            });
            const product = existingProduct ?? await tx.product.create({
                data: {
                    shopId,
                    name: item.name,
                    sku: item.sku,
                    barcode: item.barcode,
                    unit: item.unit || "pcs",
                    mrp: item.mrp,
                    sellingPrice: item.sellingPrice,
                    costPrice: item.purchasePrice,
                    gstRate: item.gstRate,
                    categoryId: category.id
                }
            });
            await tx.inventory.upsert({
                where: { productId_branchId: { productId: product.id, branchId: branch.id } },
                update: { quantity: { decrement: Math.trunc(item.quantity) } },
                create: { productId: product.id, branchId: branch.id, quantity: Math.max(0, -Math.trunc(item.quantity)) }
            });
            productRows.push({
                productId: product.id,
                quantity: item.quantity,
                unitPrice: item.sellingPrice,
                gstRate: item.gstRate,
                total: item.lineTotal
            });
        }
        return tx.order.create({
            data: {
                invoiceNo: input.invoiceNo,
                branchId: branch.id,
                customerId,
                subtotal: input.subtotal,
                tax: input.tax,
                discount: input.discount,
                total: input.total,
                status: "PAID",
                notes: `Offline sync. Savings: ${input.savings}. Profit: ${input.profit}.`,
                createdAt: new Date(input.createdAt),
                items: { create: productRows },
                payments: {
                    create: {
                        method: paymentMethod(input.paymentMethod),
                        amount: input.total,
                        status: "PAID"
                    }
                }
            },
            include: { items: true, payments: true, customer: true }
        });
    });
}
syncRouter.get("/status", (_req, res) => {
    res.json({ ok: true, service: "sync", serverTime: new Date().toISOString() });
});
syncRouter.post("/sales", requireSyncAuth, async (req, res, next) => {
    try {
        const input = offlineSaleSchema.parse(req.body);
        const synced = await syncSale(input, req.user?.shopId);
        return res.status(201).json({ status: "synced", order: synced });
    }
    catch (error) {
        return next(error);
    }
});
syncRouter.post("/products", requireSyncAuth, async (req, res, next) => {
    try {
        const rows = z.array(productSyncSchema).parse(Array.isArray(req.body) ? req.body : req.body.items ?? [req.body]);
        const synced = [];
        for (const row of rows)
            synced.push(await syncProduct(row, req.user?.shopId));
        res.status(201).json({ status: "synced", count: synced.length, products: synced });
    }
    catch (error) {
        next(error);
    }
});
syncRouter.post("/customers", requireSyncAuth, async (req, res, next) => {
    try {
        const rows = z.array(customerSyncSchema).parse(Array.isArray(req.body) ? req.body : req.body.items ?? [req.body]);
        const synced = [];
        for (const row of rows)
            synced.push(await syncCustomer(row, req.user?.shopId));
        res.status(201).json({ status: "synced", count: synced.length, customers: synced });
    }
    catch (error) {
        next(error);
    }
});
syncRouter.post("/inventory", requireSyncAuth, async (req, res, next) => {
    try {
        const rows = z.array(inventorySyncSchema).parse(Array.isArray(req.body) ? req.body : req.body.items ?? [req.body]);
        const synced = [];
        for (const row of rows)
            synced.push(await syncInventory(row, req.user?.shopId));
        res.status(201).json({ status: "synced", count: synced.length, inventory: synced });
    }
    catch (error) {
        next(error);
    }
});
syncRouter.post("/payments", requireSyncAuth, async (req, res, next) => {
    try {
        const rows = z.array(paymentSyncSchema).parse(Array.isArray(req.body) ? req.body : req.body.items ?? [req.body]);
        const synced = [];
        for (const row of rows)
            synced.push(await syncPayment(row));
        res.status(201).json({ status: "synced", count: synced.length, payments: synced });
    }
    catch (error) {
        next(error);
    }
});
syncRouter.post("/bulk", requireSyncAuth, async (req, res, next) => {
    try {
        const input = z.object({
            entityType: z.string().optional(),
            items: z.array(z.object({
                id: z.string(),
                entityType: z.string(),
                entityId: z.string(),
                action: z.string(),
                payload: z.unknown()
            })).min(1)
        }).parse(req.body);
        const completedIds = [];
        const failed = [];
        for (const item of input.items) {
            try {
                if (item.entityType === "sale")
                    await syncSale(offlineSaleSchema.parse(item.payload), req.user?.shopId);
                else if (item.entityType === "product")
                    await syncProduct(productSyncSchema.parse(item.payload), req.user?.shopId);
                else if (item.entityType === "customer")
                    await syncCustomer(customerSyncSchema.parse(item.payload), req.user?.shopId);
                else if (item.entityType === "stockMovement")
                    await syncInventory(inventorySyncSchema.parse(item.payload), req.user?.shopId);
                else if (item.entityType === "payment")
                    await syncPayment(paymentSyncSchema.parse(item.payload));
                else
                    throw new Error(`Unsupported sync entity: ${item.entityType}`);
                completedIds.push(item.id);
            }
            catch (error) {
                failed.push({ id: item.id, message: error instanceof Error ? error.message : "Sync failed" });
            }
        }
        res.json({ status: failed.length ? "partial" : "synced", completedIds, failed });
    }
    catch (error) {
        next(error);
    }
});
