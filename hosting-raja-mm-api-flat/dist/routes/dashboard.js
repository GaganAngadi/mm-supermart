import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
export const dashboardRouter = Router();
dashboardRouter.get("/", requireAuth, async (_req, res) => {
    res.json({
        todaySales: 0,
        monthlyRevenue: 0,
        totalOrders: 0,
        inventoryValue: 0,
        lowStockAlerts: 0,
        expiringProducts: 0,
        bestSellingProducts: [],
        recentTransactions: []
    });
});
