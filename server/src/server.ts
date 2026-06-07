import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { accountingRouter } from "./routes/accounting.js";
import { attendanceRouter } from "./routes/attendance.js";
import { customerRouter } from "./routes/customers.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { employeeRouter } from "./routes/employees.js";
import { googleSheetsRouter } from "./routes/google-sheets.js";
import { inventoryItemRouter } from "./routes/inventory-items.js";
import { notificationRouter } from "./routes/notifications.js";
import { orderRouter } from "./routes/orders.js";
import { productRouter } from "./routes/products.js";
import { purchaseRouter } from "./routes/purchases.js";
import { reportRouter } from "./routes/reports.js";
import { settingsRouter } from "./routes/settings.js";
import { supplierRouter } from "./routes/suppliers.js";
import { syncRouter } from "./routes/sync.js";
import { uploadRouter } from "./routes/uploads.js";
import { apiRateLimiter, authRateLimiter, requestContext } from "./middleware/security.js";
import { errorHandler } from "./utils/error-handler.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const allowedOrigins = new Set(
  (process.env.WEB_ORIGIN ?? "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002,http://127.0.0.1:3003")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(path.resolve(__dirname, "../../uploads")));
app.use(morgan("dev"));
app.use(requestContext);
app.use(apiRateLimiter);

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "mm-supermart-api" }));
app.use("/api/auth", authRateLimiter, authRouter);
app.use("/api/accounting", accountingRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/customers", customerRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/products", productRouter);
app.use("/api/orders", orderRouter);
app.use("/api/employees", employeeRouter);
app.use("/api/google-sheets", googleSheetsRouter);
app.use("/api/inventory-items", inventoryItemRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/purchases", purchaseRouter);
app.use("/api/reports", reportRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/suppliers", supplierRouter);
app.use("/api/sync", syncRouter);
app.use("/api/uploads", uploadRouter);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`M&M SuperMart API running on http://localhost:${port}`);
});
