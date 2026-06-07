import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { INVENTORY_BARCODE_TYPE, resolveInventoryBarcode } from "../services/barcode.service.js";
import { buildInventoryQrPayload } from "../services/qr-code.service.js";
import { getCachedJson, setCachedJson } from "../services/redis-cache.js";
export const productRouter = Router();
const productSelect = {
    id: true,
    shopId: true,
    name: true,
    sku: true,
    barcode: true,
    brand: true,
    description: true,
    imageUrl: true,
    unit: true,
    mrp: true,
    sellingPrice: true,
    costPrice: true,
    gstRate: true,
    taxCode: true,
    lowStockThreshold: true,
    categoryId: true,
    supplierId: true,
    createdAt: true,
    updatedAt: true,
    category: true
};
const productSchema = z.object({
    name: z.string().min(2),
    sku: z.string().min(3).optional(),
    barcode: z.string().optional(),
    barcodeType: z.string().optional(),
    qrCode: z.string().optional(),
    categoryId: z.string().optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    hsnCode: z.string().optional(),
    unit: z.string().optional(),
    mrp: z.number().nonnegative(),
    sellingPrice: z.number().nonnegative(),
    gstRate: z.number().min(0).max(28),
    lowStockThreshold: z.number().int().nonnegative().default(10)
});
function normalizeBarcode(value) {
    return value.replace(/[^A-Za-z0-9_-]+/g, "").trim().slice(0, 50);
}
function cleanText(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function cleanNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
}
function generateSku(name, barcode) {
    const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18) || "PRODUCT";
    return `MM-${base}-${(barcode || Date.now().toString()).slice(-6)}`;
}
async function getCategoryId(shopId, categoryName = "Grocery") {
    const existing = await prisma.category.findFirst({ where: { shopId, name: categoryName } });
    if (existing)
        return existing.id;
    return (await prisma.category.create({ data: { shopId, name: categoryName } })).id;
}
async function fetchJson(url, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok)
            return null;
        return await response.json();
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
async function lookupOpenFacts(host, source, barcode) {
    const data = await fetchJson(`https://${host}/api/v2/product/${barcode}.json`);
    const product = data?.product;
    if (!product?.product_name)
        return null;
    return {
        barcode,
        name: cleanText(product.product_name) ?? `Product ${barcode}`,
        brand: cleanText(product.brands),
        category: cleanText(product.categories_tags?.[0]?.replace(/^en:/, "")) ?? cleanText(product.categories),
        imageUrl: cleanText(product.image_front_url) ?? cleanText(product.image_url),
        unit: cleanText(product.quantity),
        manufacturer: cleanText(product.manufacturing_places),
        description: cleanText(product.generic_name),
        source
    };
}
async function lookupOpenFoodFacts(barcode) {
    return lookupOpenFacts("world.openfoodfacts.org", "OpenFoodFacts", barcode);
}
async function lookupOpenBeautyFacts(barcode) {
    return lookupOpenFacts("world.openbeautyfacts.org", "OpenBeautyFacts", barcode);
}
async function lookupOpenProductsFacts(barcode) {
    return lookupOpenFacts("world.openproductsfacts.org", "OpenProductsFacts", barcode);
}
async function lookupUpcItemDb(barcode) {
    const key = process.env.UPCITEMDB_API_KEY;
    const data = await fetchJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, key ? { headers: { key } } : undefined);
    const item = data?.items?.[0];
    if (!item?.title)
        return null;
    return {
        barcode,
        name: cleanText(item.title) ?? `Product ${barcode}`,
        brand: cleanText(item.brand),
        category: cleanText(item.category),
        imageUrl: cleanText(item.images?.[0]),
        description: cleanText(item.description),
        mrp: cleanNumber(item.offers?.[0]?.price),
        sellingPrice: cleanNumber(item.offers?.[0]?.price),
        source: "UPCItemDB"
    };
}
async function lookupBarcodeLookup(barcode) {
    const key = process.env.BARCODELOOKUP_API_KEY;
    if (!key)
        return null;
    const data = await fetchJson(`https://api.barcodelookup.com/v3/products?barcode=${barcode}&formatted=y&key=${key}`);
    const product = data?.products?.[0];
    if (!product?.title)
        return null;
    return {
        barcode,
        name: cleanText(product.title) ?? `Product ${barcode}`,
        brand: cleanText(product.brand),
        category: cleanText(product.category),
        imageUrl: cleanText(product.images?.[0]),
        manufacturer: cleanText(product.manufacturer),
        description: cleanText(product.description),
        mrp: cleanNumber(product.stores?.[0]?.price),
        sellingPrice: cleanNumber(product.stores?.[0]?.price),
        source: "BarcodeLookup"
    };
}
async function lookupOnlineBarcode(barcode) {
    for (const lookup of [lookupOpenFoodFacts, lookupOpenBeautyFacts, lookupOpenProductsFacts, lookupUpcItemDb, lookupBarcodeLookup]) {
        const product = await lookup(barcode);
        if (product)
            return product;
    }
    return null;
}
function barcodeCacheKey(barcode) {
    return `barcode-cache:${barcode}`;
}
function isOnlineProduct(value) {
    const product = value;
    return Boolean(product?.barcode && product?.name);
}
async function getBarcodeCache(barcode) {
    const cached = await prisma.setting.findFirst({ where: { shopId: null, key: barcodeCacheKey(barcode) } });
    return isOnlineProduct(cached?.value) ? cached.value : null;
}
async function setBarcodeCache(product) {
    const key = barcodeCacheKey(product.barcode);
    const existing = await prisma.setting.findFirst({ where: { shopId: null, key } });
    const value = { ...product, cachedAt: new Date().toISOString() };
    if (existing) {
        await prisma.setting.update({ where: { id: existing.id }, data: { value } });
        return;
    }
    await prisma.setting.create({ data: { shopId: null, key, value } });
}
function serializeProduct(product) {
    if (!product)
        return null;
    return {
        ...product,
        hsnCode: product.taxCode,
        mrp: Number(product.mrp),
        sellingPrice: Number(product.sellingPrice),
        costPrice: Number(product.costPrice),
        gstRate: Number(product.gstRate)
    };
}
async function saveProduct(input, shopId) {
    const categoryId = input.categoryId ?? await getCategoryId(shopId, input.category);
    const barcode = input.barcode ? normalizeBarcode(input.barcode) : undefined;
    const existing = barcode ? await prisma.product.findFirst({ where: { shopId, barcode }, select: productSelect }) : null;
    const data = {
        name: input.name,
        sku: input.sku ?? existing?.sku ?? generateSku(input.name, barcode),
        barcode,
        brand: input.brand,
        description: input.description,
        imageUrl: input.imageUrl,
        unit: input.unit ?? "pcs",
        mrp: input.mrp,
        sellingPrice: input.sellingPrice,
        gstRate: input.gstRate,
        taxCode: input.hsnCode,
        lowStockThreshold: input.lowStockThreshold,
        categoryId,
        shopId
    };
    if (existing)
        return prisma.product.update({ where: { id: existing.id }, data, select: productSelect });
    return prisma.product.create({ data, select: productSelect });
}
function barcodeMetadataData(input) {
    return input;
}
productRouter.get("/", requireAuth, async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const take = Math.min(Number(req.query.take ?? 20), 100);
    const search = String(req.query.search ?? "");
    const cacheKey = `products:list:${req.user?.shopId ?? "global"}:${page}:${take}:${search.toLowerCase()}`;
    const cached = await getCachedJson(cacheKey);
    if (cached)
        return res.json(cached);
    const where = {
        ...(req.user?.shopId ? { shopId: req.user.shopId } : {}),
        ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }, { barcode: { contains: search } }, { brand: { contains: search } }] } : {})
    };
    const [data, total] = await Promise.all([
        prisma.product.findMany({ where, skip: (page - 1) * take, take, select: productSelect }),
        prisma.product.count({ where })
    ]);
    const payload = { data: data.map(serializeProduct), meta: { page, take, total } };
    await setCachedJson(cacheKey, payload, 45);
    res.json(payload);
});
productRouter.get("/barcode/:barcode", requireAuth, async (req, res) => {
    const barcode = normalizeBarcode(String(req.params.barcode));
    const local = await prisma.product.findFirst({
        where: { ...(req.user?.shopId ? { shopId: req.user.shopId } : {}), barcode },
        select: productSelect
    });
    if (local)
        return res.json({ source: "local", product: serializeProduct(local), suggestions: [] });
    const cached = await getBarcodeCache(barcode);
    if (cached)
        return res.json({ source: cached.source ? `${cached.source} cache` : "barcode cache", product: cached, suggestions: [], cached: true });
    const online = await lookupOnlineBarcode(barcode);
    if (online)
        await setBarcodeCache(online);
    const firstWord = online?.name.split(/\s+/)[0];
    const suggestions = online ? await prisma.product.findMany({
        where: {
            ...(req.user?.shopId ? { shopId: req.user.shopId } : {}),
            OR: [
                ...(online.brand ? [{ brand: { contains: online.brand } }] : []),
                ...(firstWord ? [{ name: { contains: firstWord } }] : [])
            ]
        },
        select: productSelect,
        take: 5
    }) : [];
    return res.json({ source: online?.source ?? "none", product: online, suggestions: suggestions.map(serializeProduct) });
});
productRouter.post("/", requireAuth, requireRole(["Super Admin", "Store Owner", "Manager", "Inventory Staff"]), async (req, res, next) => {
    try {
        const input = productSchema.parse(req.body);
        return res.status(201).json(serializeProduct(await saveProduct(input, req.user?.shopId)));
    }
    catch (error) {
        return next(error);
    }
});
productRouter.post("/create", requireAuth, requireRole(["Super Admin", "Store Owner", "Manager", "Inventory Staff"]), async (req, res, next) => {
    try {
        const input = productSchema.parse(req.body);
        return res.status(201).json(serializeProduct(await saveProduct(input, req.user?.shopId)));
    }
    catch (error) {
        return next(error);
    }
});
productRouter.post("/import", requireAuth, requireRole(["Super Admin", "Store Owner", "Manager", "Inventory Staff"]), async (req, res, next) => {
    try {
        const inputs = z.array(productSchema).parse(req.body.products ?? req.body);
        const saved = [];
        for (const input of inputs)
            saved.push(await saveProduct(input, req.user?.shopId));
        return res.status(201).json(saved.map(serializeProduct));
    }
    catch (error) {
        return next(error);
    }
});
productRouter.post("/barcodes/generate", requireAuth, requireRole(["Super Admin", "Store Owner", "Manager", "Inventory Staff"]), async (req, res, next) => {
    try {
        const input = z.object({ productId: z.string() }).parse(req.body);
        const product = await prisma.product.findFirst({
            where: { id: input.productId, ...(req.user?.shopId ? { shopId: req.user.shopId } : {}) }
        });
        if (!product)
            return res.status(404).json({ message: "Product not found" });
        const totalProducts = await prisma.product.count({ where: req.user?.shopId ? { shopId: req.user.shopId } : {} });
        const barcode = resolveInventoryBarcode(product, totalProducts + 1);
        const qrCode = buildInventoryQrPayload({ productId: product.id, productName: product.name, sku: product.sku });
        const updated = await prisma.product.update({
            where: { id: product.id },
            data: barcodeMetadataData({ barcode, barcodeType: INVENTORY_BARCODE_TYPE, qrCode })
        });
        return res.json(serializeProduct(updated));
    }
    catch (error) {
        return next(error);
    }
});
productRouter.post("/barcodes/bulk-generate", requireAuth, requireRole(["Super Admin", "Store Owner", "Manager", "Inventory Staff"]), async (req, res, next) => {
    try {
        const input = z.object({ productIds: z.array(z.string()).default([]) }).parse(req.body);
        const products = await prisma.product.findMany({
            where: {
                ...(req.user?.shopId ? { shopId: req.user.shopId } : {}),
                ...(input.productIds.length ? { id: { in: input.productIds } } : {})
            },
            orderBy: { createdAt: "asc" }
        });
        const saved = [];
        for (let index = 0; index < products.length; index += 1) {
            const product = products[index];
            const barcode = resolveInventoryBarcode(product, index + 1);
            const qrCode = buildInventoryQrPayload({ productId: product.id, productName: product.name, sku: product.sku });
            saved.push(await prisma.product.update({
                where: { id: product.id },
                data: barcodeMetadataData({ barcode, barcodeType: INVENTORY_BARCODE_TYPE, qrCode })
            }));
        }
        return res.json(saved.map(serializeProduct));
    }
    catch (error) {
        return next(error);
    }
});
productRouter.post("/barcodes/printed", requireAuth, requireRole(["Super Admin", "Store Owner", "Manager", "Inventory Staff"]), async (req, res, next) => {
    try {
        const input = z.object({ productIds: z.array(z.string()).min(1) }).parse(req.body);
        const result = await prisma.product.updateMany({
            where: { id: { in: input.productIds }, ...(req.user?.shopId ? { shopId: req.user.shopId } : {}) },
            data: barcodeMetadataData({ lastPrintedAt: new Date() })
        });
        return res.json({ ok: true, updated: result.count });
    }
    catch (error) {
        return next(error);
    }
});
productRouter.get("/search", requireAuth, async (req, res) => {
    const q = String(req.query.q ?? "");
    const cacheKey = `products:search:${req.user?.shopId ?? "global"}:${q.toLowerCase()}`;
    const cached = await getCachedJson(cacheKey);
    if (cached)
        return res.json(cached);
    const products = await prisma.product.findMany({
        where: {
            ...(req.user?.shopId ? { shopId: req.user.shopId } : {}),
            OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }, { brand: { contains: q } }]
        },
        take: 12
    });
    const payload = products.map(serializeProduct);
    await setCachedJson(cacheKey, payload, 30);
    res.json(payload);
});
