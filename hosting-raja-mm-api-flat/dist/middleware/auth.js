import jwt from "jsonwebtoken";
export function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token)
        return res.status(401).json({ message: "Missing bearer token" });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET ?? "dev-secret");
        return next();
    }
    catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
export function requireSyncAuth(req, res, next) {
    const configuredToken = process.env.SYNC_SHARED_SECRET || process.env.CLOUD_SYNC_TOKEN;
    const providedToken = String(req.headers["x-sync-token"] || "");
    if (configuredToken && providedToken && providedToken === configuredToken) {
        req.user = { id: "desktop-sync", role: "Super Admin", shopId: undefined, branchId: undefined };
        return next();
    }
    return requireAuth(req, res, next);
}
export function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role))
            return res.status(403).json({ message: "Forbidden" });
        return next();
    };
}
