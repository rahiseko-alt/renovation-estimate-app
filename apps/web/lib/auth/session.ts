// セッションの発行と検証。
//
// 本番では Supabase Auth に置き換える。そのとき触るのは lib/auth/ の中だけで済むよう、
// 画面からは createSessionCookie / readSession / SESSION_COOKIE_NAME だけを使う
// （AGENTS.md「結合を増やさない」4：他の機能の内部を直接触らない）。
//
// Web Crypto だけで書いている。middleware でも Route Handler でも同じコードが動く。

import { timingSafeEqualBytes } from "./compare";

export const SESSION_COOKIE_NAME = "rea_session";

/** セッションの有効期間。毎回ログインさせないため長めに取る。 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  /** 利用者の識別子。 */
  sub: string;
  /** 失効時刻（UNIX 秒）。 */
  exp: number;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * 署名鍵。設定されていなければ例外を投げる。
 * 開発用の既定値を埋め込むと、そのまま本番に出たときに誰でも署名を偽造できる。
 */
function requireSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET が未設定か短すぎます（32文字以上）。apps/web/.env.example を参照してください。",
    );
  }
  return secret;
}

async function hmac(message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(requireSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(signature);
}

/** 署名付きのセッション値を作る。戻り値をそのまま Cookie に入れる。 */
export async function createSessionValue(userId: string): Promise<string> {
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = toBase64Url(await hmac(body));
  return `${body}.${signature}`;
}

/**
 * セッション値を検証して利用者の識別子を返す。
 * 署名が合わない・期限切れ・形が違うときは null を返す。理由は呼び出し側に伝えない
 * （どこが間違っているかを外に漏らさない）。
 */
export async function readSessionValue(
  value: string | undefined,
): Promise<string | null> {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = value.slice(0, separator);
  const signature = value.slice(separator + 1);

  let expected: Uint8Array;
  try {
    expected = await hmac(body);
  } catch {
    return null;
  }

  let actual: Uint8Array;
  try {
    actual = fromBase64Url(signature);
  } catch {
    return null;
  }
  if (!timingSafeEqualBytes(expected, actual)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  } catch {
    return null;
  }

  // JSON.parse は "null" や配列も例外を投げずに通す。プロパティを読む前に
  // オブジェクトであることを確かめないと、ここで例外が漏れて 500 になる。
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof payload.sub !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload.sub;
}

/** Cookie に付ける属性。ログイン・ログアウトの両方がここを参照する。 */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
