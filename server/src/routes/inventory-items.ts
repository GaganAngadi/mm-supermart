import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { makeInventoryBarcode, normalizeInventoryBarcode } from "../services/barcode.service.js";

export const inventoryItemRouter = Router();

const writeRoles = ["Super Admin", "Store Owner", "Manager", "Inventory Staff"];

const inventoryItemSchema = z.object({
  itemCode: z.string().optional(),
  barcodeNumber: z.string().optional(),
  barcodeType: z.string().default("Code128"),
  itemName: z.string().min(1),
  itemNameKn: z.string().optional(),
  mainCategory: z.string().optional(),
  subCategory: z.string().optional(),
  companyName: z.string().optional(),
  packing: z.string().optional(),
  size: z.string().optional(),
  unit: z.string().optional(),
  hsnCode: z.string().optional(),
  openingStock: z.number().default(0),
  currentStock: z.number().default(0),
  purchasePrice: z.number().default(0),
  costPrice: z.number().default(0),
  sellingPrice: z.number().default(0),
  dealerPrice: z.number().default(0),
  mrp: z.number().default(0),
  discountPercent: z.number().default(0),
  gstPercent: z.number().default(0),
  rackLocation: z.string().optional(),
  minimumStock: z.number().default(0),
  reorderQuantity: z.number().default(0),
  salesAccount: z.string().optional(),
  purchaseAccount: z.string().optional()
});

inventoryItemRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const search = String(req.query.search || "").trim();
    const rows = search
      ? await prisma.$queryRawUnsafe("SELECT * FROM inventory_items WHERE item_name LIKE ? OR item_code LIKE ? OR barcode_number LIKE ? OR main_category LIKE ? OR company_name LIKE ? ORDER BY updated_at DESC LIMIT 250", `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
      : await prisma.$queryRawUnsafe("SELECT * FROM inventory_items ORDER BY updated_at DESC LIMIT 250");
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

inventoryItemRouter.post("/", requireAuth, requireRole(writeRoles), async (req, res, next) => {
  try {
    const input = inventoryItemSchema.parse(req.body);
    const total = Number((await prisma.$queryRawUnsafe<Array<{ count: bigint }>>("SELECT COUNT(*) as count FROM inventory_items"))[0]?.count || 0);
    const itemCode = normalizeInventoryBarcode(input.itemCode || "") || makeInventoryBarcode(total + 1);
    const barcodeNumber = normalizeInventoryBarcode(input.barcodeNumber || "") || itemCode;
    await prisma.$executeRawUnsafe(
      "INSERT INTO inventory_items (id,item_code,barcode_number,barcode_type,item_name,item_name_kn,main_category,sub_category,company_name,packing,size,unit,hsn_code,opening_stock,current_stock,purchase_price,cost_price,selling_price,dealer_price,mrp,discount_percent,gst_percent,rack_location,minimum_stock,reorder_quantity,sales_account,purchase_account,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3))",
      `inv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      itemCode,
      barcodeNumber,
      input.barcodeType,
      input.itemName,
      input.itemNameKn || null,
      input.mainCategory || null,
      input.subCategory || null,
      input.companyName || null,
      input.packing || null,
      input.size || null,
      input.unit || null,
      input.hsnCode || null,
      input.openingStock,
      input.currentStock,
      input.purchasePrice,
      input.costPrice,
      input.sellingPrice,
      input.dealerPrice,
      input.mrp,
      input.discountPercent,
      input.gstPercent,
      input.rackLocation || null,
      input.minimumStock,
      input.reorderQuantity,
      input.salesAccount || null,
      input.purchaseAccount || null
    );
    return res.status(201).json({ ok: true, itemCode, barcodeNumber });
  } catch (error) {
    return next(error);
  }
});

inventoryItemRouter.post("/printed", requireAuth, requireRole(writeRoles), async (req, res, next) => {
  try {
    const input = z.object({ itemCodes: z.array(z.string()).min(1) }).parse(req.body);
    await prisma.$executeRawUnsafe(`UPDATE inventory_items SET print_count = print_count + 1, last_printed = NOW(3), updated_at = NOW(3) WHERE item_code IN (${input.itemCodes.map(() => "?").join(",")})`, ...input.itemCodes);
    return res.json({ ok: true, updated: input.itemCodes.length });
  } catch (error) {
    return next(error);
  }
});
