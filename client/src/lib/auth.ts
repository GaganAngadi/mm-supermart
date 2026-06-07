"use client";

export type AuthUser = {
  name: string;
  email?: string;
  role: string;
  shopName?: string;
};

export const rolePermissions: Record<string, string[]> = {
  "Super Admin": ["dashboard", "pos", "inventory", "accounting", "customers", "suppliers", "employees", "reports", "settings"],
  "Admin": ["dashboard", "pos", "inventory", "customers", "suppliers", "employees", "reports"],
  "Store Owner": ["dashboard", "pos", "inventory", "accounting", "customers", "suppliers", "employees", "reports", "settings"],
  "Manager": ["dashboard", "pos", "inventory", "accounting", "customers", "suppliers", "employees", "reports", "settings"],
  "Cashier": ["pos", "customers", "reports"],
  "Accountant": ["dashboard", "accounting", "reports", "customers"]
};

function decodeJwtPayload(token: string) {
  try {
    const base64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!base64) return null;
    return JSON.parse(window.atob(base64)) as { exp?: number; role?: string; email?: string };
  } catch {
    return null;
  }
}

export function getAuthToken() {
  return localStorage.getItem("auth-token") ?? "";
}

export function getAuthUser(): AuthUser | null {
  const token = getAuthToken();
  if (!token || isTokenExpired(token)) return null;
  return {
    name: localStorage.getItem("user-name") || "User",
    email: localStorage.getItem("user-email") || undefined,
    role: localStorage.getItem("user-role") || decodeJwtPayload(token)?.role || "Cashier",
    shopName: localStorage.getItem("shop-name") || undefined
  };
}

export function isTokenExpired(token: string) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now();
}

export function saveAuthSession(token: string, user: AuthUser) {
  localStorage.setItem("auth-token", token);
  localStorage.setItem("user-name", user.name);
  localStorage.setItem("user-role", user.role);
  if (user.email) localStorage.setItem("user-email", user.email);
  if (user.shopName) localStorage.setItem("shop-name", user.shopName);
}

export function clearAuthSession() {
  localStorage.removeItem("auth-token");
  localStorage.removeItem("refresh-token");
  localStorage.removeItem("user-name");
  localStorage.removeItem("user-email");
  localStorage.removeItem("user-role");
  localStorage.removeItem("shop-name");
}

export function canAccess(role: string, href: string) {
  const moduleName = href.replace("/", "") || "dashboard";
  return (rolePermissions[role] ?? rolePermissions.Cashier).includes(moduleName);
}
