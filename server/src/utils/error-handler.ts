import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(422).json({ message: "Validation failed", issues: error.flatten() });
  }
  console.error(error);
  return res.status(error.status ?? 500).json({ message: error.message ?? "Internal server error" });
};
