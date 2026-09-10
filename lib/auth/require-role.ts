import { AppError } from "@/lib/errors";
import { getSession } from "@/lib/auth/get-session";
import type { AppUser } from "@/lib/auth/get-session";
import type { UserRole } from "@/lib/types/enums";

const ROLE_ORDER: UserRole[] = ["viewer", "collector", "admin"];

export async function requireRole(minimum: UserRole): Promise<AppUser> {
  const { appUser } = await getSession();

  if (!appUser) {
    throw new AppError("UNAUTHENTICATED", "No active session.");
  }

  if (!appUser.is_active) {
    throw new AppError("FORBIDDEN", "Account is inactive.");
  }

  const userLevel = ROLE_ORDER.indexOf(appUser.role as UserRole);
  const requiredLevel = ROLE_ORDER.indexOf(minimum);

  if (userLevel < requiredLevel) {
    throw new AppError("FORBIDDEN", "Insufficient role.");
  }

  return appUser;
}
