import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
export const settingsRouter = Router();
const brandingDefaults = {
    brandName: "M&M SuperMart",
    primaryColor: "#047857",
    secondaryColor: "#ffffff",
    accentColor: "#f97316",
    logoUrl: "/mm-logo.jpg",
    gstin: "29AABCMMSUP1Z5",
    footer: "Thank you for shopping with M&M SuperMart"
};
const brandingSchema = z.object({
    brandName: z.string().min(1).default(brandingDefaults.brandName),
    primaryColor: z.string().min(1).default(brandingDefaults.primaryColor),
    secondaryColor: z.string().min(1).default(brandingDefaults.secondaryColor),
    accentColor: z.string().min(1).default(brandingDefaults.accentColor),
    logoUrl: z.string().min(1).default(brandingDefaults.logoUrl),
    gstin: z.string().trim().optional().default(brandingDefaults.gstin),
    footer: z.string().trim().optional().default(brandingDefaults.footer)
});
function mergeBranding(value) {
    const stored = typeof value === "object" && value ? value : {};
    return brandingSchema.parse({ ...brandingDefaults, ...stored });
}
settingsRouter.get("/branding", requireAuth, async (req, res, next) => {
    try {
        const setting = await prisma.setting.findFirst({
            where: { shopId: req.user?.shopId ?? null, key: "branding" }
        });
        res.json(mergeBranding(setting?.value));
    }
    catch (error) {
        next(error);
    }
});
settingsRouter.put("/branding", requireAuth, requireRole(["Super Admin", "Store Owner", "Admin", "Manager"]), async (req, res, next) => {
    try {
        const input = brandingSchema.parse({ ...brandingDefaults, ...req.body });
        const existing = await prisma.setting.findFirst({
            where: { shopId: req.user?.shopId ?? null, key: "branding" }
        });
        const setting = existing
            ? await prisma.setting.update({ where: { id: existing.id }, data: { value: input } })
            : await prisma.setting.create({ data: { shopId: req.user?.shopId, key: "branding", value: input } });
        if (req.user?.shopId) {
            await prisma.shop.update({
                where: { id: req.user.shopId },
                data: { name: input.brandName, gstin: input.gstin || null }
            }).catch(() => null);
        }
        res.json({ message: "Settings saved", data: mergeBranding(setting.value) });
    }
    catch (error) {
        next(error);
    }
});
