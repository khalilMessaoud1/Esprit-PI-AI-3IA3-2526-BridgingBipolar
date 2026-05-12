const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

/** API stores paths like `/uploads/...` — resolve against the API origin so `<img src>` works from the Next app. */
export function resolveMediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  const p = path.trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("blob:") || p.startsWith("data:")) return p;
  if (p.startsWith("/")) return `${API_URL}${p}`;
  return `${API_URL}/${p}`;
}
