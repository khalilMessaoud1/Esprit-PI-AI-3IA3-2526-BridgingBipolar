import type { UserRole } from "../hooks/useAuth";

export type PostAuthUser = {
  role: UserRole;
  firstLogin: boolean;
};

/** Where to send the user after login or signup. */
export function postAuthPath(user: PostAuthUser): string {
  if (user.role === "DOCTOR") return "/doctor";
  if (user.role === "RELATIVE") return "/dashboard";
  if (user.role === "PATIENT" && user.firstLogin) return "/onboarding";
  return "/dashboard";
}
