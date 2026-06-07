import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const signupSchema = z.object({
  shopName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  password: z.string().min(8),
  gstin: z.string().optional(),
  address: z.string().optional()
});

function makeSlug(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "shop";
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

function signAccessToken(payload: object) {
  return jwt.sign(payload, process.env.JWT_SECRET ?? "dev-secret", { expiresIn: "8h" });
}

function signRefreshToken(payload: object) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? "dev-secret", { expiresIn: "30d" });
}

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email }, include: { role: true, employee: true, shop: true } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      if (user) {
        await prisma.loginActivity.create({
          data: {
            userId: user.id,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            success: false
          }
        });
      }
      return res.status(401).json({ message: "Invalid credentials" });
    }
    await prisma.loginActivity.create({
      data: {
        userId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        success: true
      }
    });
    const payload = { id: user.id, role: user.role.name, shopId: user.shopId ?? undefined, branchId: user.employee?.branchId };
    const token = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    return res.json({ token, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role.name, shopId: user.shopId, shopName: user.shop?.name } });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/signup", async (req, res, next) => {
  try {
    if (process.env.ALLOW_PUBLIC_SIGNUP !== "true") {
      return res.status(403).json({ message: "Shop account creation is locked by administrator" });
    }
    const input = signupSchema.parse(req.body);
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) return res.status(409).json({ message: "An account already exists for this email" });

    const result = await prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { name: "Store Owner" },
        update: {},
        create: { name: "Store Owner", description: "Shop owner access", permissions: { modules: ["dashboard", "pos", "inventory", "customers", "reports", "settings"] } }
      });

      const shop = await tx.shop.create({
        data: {
          name: input.shopName,
          slug: makeSlug(input.shopName),
          ownerName: input.ownerName,
          email: input.email,
          phone: input.phone,
          gstin: input.gstin,
          address: input.address
        }
      });

      const user = await tx.user.create({
        data: {
          name: input.ownerName,
          email: input.email,
          passwordHash: await bcrypt.hash(input.password, 10),
          roleId: role.id,
          shopId: shop.id
        }
      });

      await tx.branch.create({
        data: {
          shopId: shop.id,
          name: `${shop.name} Main Branch`,
          code: `${shop.slug}-MAIN`.toUpperCase().slice(0, 48),
          address: input.address || "Primary shop location",
          phone: input.phone,
          gstin: input.gstin
        }
      });

      await tx.category.createMany({
        data: ["Grocery", "Dairy", "Snacks", "Personal Care", "Household"].map((name) => ({ shopId: shop.id, name })),
        skipDuplicates: true
      });

      await tx.setting.create({
        data: { shopId: shop.id, key: "branding", value: { brandName: shop.name, primaryColor: "#047857", accentColor: "#f97316", logoUrl: "/mm-logo.jpg" } }
      });

      return { shop, user, role };
    });

    const payload = { id: result.user.id, role: result.role.name, shopId: result.shop.id };
    const token = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    return res.status(201).json({ token, refreshToken, user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.role.name, shopId: result.shop.id, shopName: result.shop.name } });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/refresh", async (req, res) => {
  const refreshToken = req.body.refreshToken ?? req.headers.authorization?.replace("Bearer ", "");
  if (!refreshToken) return res.status(401).json({ message: "Missing refresh token" });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? "dev-secret") as { id: string; role: string; shopId?: string; branchId?: string };
    const token = signAccessToken({ id: payload.id, role: payload.role, shopId: payload.shopId, branchId: payload.branchId });
    return res.json({ token });
  } catch {
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
});

authRouter.patch("/me/credentials", async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ message: "Missing bearer token" });
    const userToken = jwt.verify(token, process.env.JWT_SECRET ?? "dev-secret") as { id: string };
    const input = z.object({
      currentPassword: z.string().min(8),
      userId: z.string().email().optional(),
      newPassword: z.string().min(8).optional()
    }).parse(req.body);

    if (!input.userId && !input.newPassword) {
      return res.status(400).json({ message: "Enter a new User ID or new password" });
    }

    const user = await prisma.user.findUnique({ where: { id: userToken.id }, include: { role: true, shop: true } });
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    if (input.userId && input.userId !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: input.userId } });
      if (existing) return res.status(409).json({ message: "This User ID is already used" });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: input.userId ?? user.email,
        passwordHash: input.newPassword ? await bcrypt.hash(input.newPassword, 10) : user.passwordHash
      },
      include: { role: true, shop: true }
    });

    return res.json({ user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role.name, shopName: updated.shop?.name } });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/forgot-password", async (req, res) => {
  return res.json({ message: "Password reset provider hook queued", email: req.body.email });
});
