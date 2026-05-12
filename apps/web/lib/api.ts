const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

export type ApiResponse<T> = {
  data: T;
};

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("bb_token") : null;
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw || "Request failed";
    try {
      const j = JSON.parse(raw) as { message?: string | string[] };
      if (Array.isArray(j.message)) message = j.message.join(". ");
      else if (typeof j.message === "string") message = j.message;
    } catch {
      /* keep raw text */
    }
    throw new Error(message);
  }

  return response.json();
}

/** Multipart upload (e.g. prescription image). Do not set Content-Type — browser sets boundary. */
export async function apiUploadFile<T>(path: string, formData: FormData): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("bb_token") : null;
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: formData
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = raw || "Request failed";
    try {
      const j = JSON.parse(raw) as { message?: string | string[] };
      if (Array.isArray(j.message)) message = j.message.join(". ");
      else if (typeof j.message === "string") message = j.message;
    } catch {
      /* keep raw text */
    }
    throw new Error(message);
  }

  return response.json();
}
