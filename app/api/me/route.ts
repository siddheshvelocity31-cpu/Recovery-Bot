import { ok, fail } from "@/lib/errors";
import { getSession } from "@/lib/auth/get-session";
import { AppError } from "@/lib/errors";

export async function GET() {
  try {
    const { appUser } = await getSession();

    if (!appUser) {
      return fail("UNAUTHENTICATED", "No active session.");
    }

    if (!appUser.is_active) {
      return fail("FORBIDDEN", "Account is inactive.");
    }

    return ok(appUser);
  } catch (err) {
    if (err instanceof AppError) {
      return fail(err.code, err.message);
    }
    return fail("INTERNAL", "Unexpected error.");
  }
}
