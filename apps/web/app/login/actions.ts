"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyCredentials } from "../../lib/auth/credentials";
import { sanitizeNextPath } from "../../lib/auth/next-path";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSessionValue,
  sessionCookieOptions,
} from "../../lib/auth/session";

export async function login(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNextPath(formData.get("next"));

  const userId = await verifyCredentials(email, password);
  if (!userId) {
    redirect(`/login?failed=1&next=${encodeURIComponent(next)}`);
  }

  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    await createSessionValue(userId),
    sessionCookieOptions(SESSION_TTL_SECONDS),
  );

  redirect(next);
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
  redirect("/");
}
