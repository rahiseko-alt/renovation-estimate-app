"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyCredentials } from "../../lib/auth/credentials";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSessionValue,
  sessionCookieOptions,
} from "../../lib/auth/session";

export async function login(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const userId = await verifyCredentials(email, password);
  if (!userId) redirect("/login?failed=1");

  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    await createSessionValue(userId),
    sessionCookieOptions(SESSION_TTL_SECONDS),
  );

  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
  redirect("/");
}
