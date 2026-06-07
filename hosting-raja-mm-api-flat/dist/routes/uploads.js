import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
export const uploadRouter = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.resolve(__dirname, "../../../uploads/products");
fs.mkdirSync(uploadRoot, { recursive: true });
const storage = multer.diskStorage({
    destination: uploadRoot,
    filename: (_req, file, cb) => {
        const safeName = file.originalname.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
        cb(null, `${Date.now()}-${safeName}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024, files: 5 },
    fileFilter: (_req, file, cb) => {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
            cb(new Error("Only JPG, PNG, and WEBP product images are allowed"));
            return;
        }
        cb(null, true);
    }
});
uploadRouter.post("/products", requireAuth, upload.array("images", 5), (req, res) => {
    const files = req.files ?? [];
    res.status(201).json({
        images: files.map((file) => ({
            filename: file.filename,
            url: `/uploads/products/${file.filename}`,
            size: file.size,
            mimetype: file.mimetype
        }))
    });
});
