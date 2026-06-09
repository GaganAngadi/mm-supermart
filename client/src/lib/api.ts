const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
export const API_BASE_URL = configuredApiUrl.replace(/\/$/, "");

export async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth-token") : "";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (response.status === 401 && path !== "/auth/login" && path !== "/auth/refresh" && typeof window !== "undefined") {
    const refreshToken = localStorage.getItem("refresh-token");
    if (refreshToken) {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });
      const refreshData = await refreshResponse.json().catch(() => ({}));
      if (refreshResponse.ok && refreshData.token) {
        localStorage.setItem("auth-token", refreshData.token);
        return apiRequest<T>(path, options);
      }
    }
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message ?? "Request failed");
  }

  return data as T;
}
