import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { googleSheetsService } from "../services/google-sheets.service.js";

export const googleSheetsRouter = Router();

const syncSchema = z.object({
  sheetUrl: z.string().min(10),
  range: z.string().default("Sheet1!A1:Z1000"),
  module: z.enum(["products", "inventory", "sales"])
});

googleSheetsRouter.post("/sync/import", requireAuth, requireRole(["Super Admin", "Manager"]), async (req, res, next) => {
  try {
    const input = syncSchema.parse(req.body);
    const sync = await prisma.googleSheetSync.create({
      data: { sheetUrl: input.sheetUrl, range: input.range, module: input.module, direction: "IMPORT", status: "RUNNING" }
    });
    const rows = await googleSheetsService.readRows(input.sheetUrl, input.range);
    await prisma.googleSheetSync.update({
      where: { id: sync.id },
      data: { status: "SUCCESS", rowsProcessed: rows.length }
    });
    res.json({ syncId: sync.id, rowsProcessed: rows.length, preview: rows.slice(0, 5) });
  } catch (error) {
    next(error);
  }
});

googleSheetsRouter.get("/sync/jobs", requireAuth, async (_req, res) => {
  res.json(await prisma.googleSheetSync.findMany({ orderBy: { createdAt: "desc" }, take: 50 }));
});
