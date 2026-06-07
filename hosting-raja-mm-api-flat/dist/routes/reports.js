import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
export const reportRouter = Router();
const reports = ["sales", "monthly", "profit-loss", "gst", "inventory", "product-performance", "attendance", "salary", "leave", "department"];
for (const name of reports) {
    reportRouter.get(`/${name}`, requireAuth, (req, res) => {
        res.json({ report: name, filters: req.query, exportFormats: ["xlsx", "pdf"], rows: [] });
    });
}
