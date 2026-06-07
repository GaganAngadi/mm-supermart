import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
export const attendanceRouter = Router();
const attendanceSchema = z.object({
    employeeId: z.string(),
    branchId: z.string(),
    source: z.enum(["MANUAL", "BIOMETRIC", "QR", "API"]).default("MANUAL")
});
attendanceRouter.get("/", requireAuth, async (req, res) => {
    const date = req.query.date ? new Date(String(req.query.date)) : undefined;
    res.json(await prisma.attendance.findMany({
        where: date ? { date } : {},
        include: { employee: true },
        orderBy: { date: "desc" },
        take: 100
    }));
});
attendanceRouter.post("/check-in", requireAuth, async (req, res, next) => {
    try {
        const input = attendanceSchema.parse(req.body);
        const record = await prisma.attendance.create({
            data: { ...input, date: new Date(), checkIn: new Date() }
        });
        res.status(201).json(record);
    }
    catch (error) {
        next(error);
    }
});
