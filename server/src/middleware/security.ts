import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

export function requestContext(req: Request, _res: Response, next: NextFunction) {
  req.headers["x-request-started-at"] = String(Date.now());
  next();
}
