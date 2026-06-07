import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type JwtUser = { id: string; role: string; shopId?: string; branchId?: string };

declare global {
  namespace Express {
    interface Request {
      user?: JwtUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Missing bearer token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET ?? "dev-secret") as JwtUser;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireSyncAuth(req: Request, res: Response, next: NextFunction) {
  const configuredToken = process.env.SYNC_SHARED_SECRET || process.env.CLOUD_SYNC_TOKEN;
  const providedToken = String(req.headers["x-sync-token"] || "");
  if (configuredToken && providedToken && providedToken === configuredToken) {
    req.user = { id: "desktop-sync", role: "Super Admin", shopId: undefined, branchId: undefined };
    return next();
  }
  return requireAuth(req, res, next);
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    return next();
  };
}
