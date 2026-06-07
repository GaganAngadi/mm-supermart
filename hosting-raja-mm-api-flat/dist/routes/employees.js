import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
export const employeeRouter = Router();
const employeeSchema = z.object({
    fullName: z.string().min(2),
    mobile: z.string().min(10),
    email: z.string().email(),
    address: z.string().optional(),
    aadhaar: z.string().optional(),
    pan: z.string().optional(),
    dateOfJoining: z.coerce.date(),
    departmentId: z.string(),
    designationId: z.string(),
    branchId: z.string(),
    shiftId: z.string().optional(),
    salary: z.number().nonnegative(),
    emergencyContact: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});
employeeRouter.get("/dashboard", requireAuth, async (_req, res) => {
    const [totalEmployees, activeEmployees, leaveRequests, payrollTotal] = await Promise.all([
        prisma.employee.count(),
        prisma.employee.count({ where: { status: "ACTIVE" } }),
        prisma.leave.count({ where: { status: "PENDING" } }),
        prisma.payroll.aggregate({ _sum: { netSalary: true }, where: { status: "PENDING" } })
    ]);
    res.json({ totalEmployees, activeEmployees, leaveRequests, payrollTotal: payrollTotal._sum.netSalary ?? 0, attendanceSummary: 91, performanceScore: 4.4 });
});
employeeRouter.get("/", requireAuth, async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const take = Math.min(Number(req.query.take ?? 20), 100);
    const search = String(req.query.search ?? "");
    const where = search ? { fullName: { contains: search } } : {};
    const [data, total] = await Promise.all([
        prisma.employee.findMany({ where, include: { department: true, designation: true, shift: true }, skip: (page - 1) * take, take }),
        prisma.employee.count({ where })
    ]);
    res.json({ data, meta: { page, take, total } });
});
employeeRouter.post("/", requireAuth, requireRole(["Super Admin", "Store Owner", "HR Manager", "Branch Manager"]), async (req, res, next) => {
    try {
        const input = employeeSchema.parse(req.body);
        const count = await prisma.employee.count();
        const employee = await prisma.employee.create({ data: { ...input, employeeCode: `EMP-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}` } });
        return res.status(201).json(employee);
    }
    catch (error) {
        return next(error);
    }
});
employeeRouter.post("/attendance/check-in", requireAuth, async (req, res) => {
    const record = await prisma.attendance.create({ data: { employeeId: req.body.employeeId, branchId: req.body.branchId, date: new Date(), checkIn: new Date(), source: req.body.source ?? "MANUAL" } });
    res.status(201).json(record);
});
