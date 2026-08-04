import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SESSION_TTL_SECONDS,
  createSessionValue,
  readSessionValue,
  sessionCookieOptions,
} from "../lib/auth/session";

const SECRET = "test-secret-that-is-long-enough-to-pass-32";

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
});

describe("createSessionValue と readSessionValue", () => {
  it("発行したセッションから利用者を読み戻せる", async () => {
    const value = await createSessionValue("oyakata@example.com");
    expect(await readSessionValue(value)).toBe("oyakata@example.com");
  });

  it("Cookie が無ければ null", async () => {
    expect(await readSessionValue(undefined)).toBeNull();
    expect(await readSessionValue("")).toBeNull();
  });

  it("署名を書き換えたら受け付けない", async () => {
    const value = await createSessionValue("oyakata@example.com");
    const [body] = value.split(".");
    expect(await readSessionValue(`${body}.aaaabbbbccccdddd`)).toBeNull();
  });

  it("中身を書き換えたら受け付けない（利用者のなりすましを防ぐ）", async () => {
    const value = await createSessionValue("oyakata@example.com");
    const signature = value.slice(value.lastIndexOf(".") + 1);
    const forged = Buffer.from(
      JSON.stringify({
        sub: "attacker@example.com",
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    ).toString("base64url");
    expect(await readSessionValue(`${forged}.${signature}`)).toBeNull();
  });

  it("鍵が違えば受け付けない", async () => {
    const value = await createSessionValue("oyakata@example.com");
    process.env.AUTH_SECRET = "another-secret-that-is-long-enough-to-pass";
    expect(await readSessionValue(value)).toBeNull();
  });

  it("期限が切れていれば受け付けない（署名は正しいものを付ける）", async () => {
    // 別の（期限内の）セッションの署名を流用すると、署名の不一致で弾かれてしまい、
    // 期限切れの判定そのものは通っていないのに緑になる。期限切れの本体に
    // 同じ鍵で正しく署名し直してから確かめる。
    const expiredBody = Buffer.from(
      JSON.stringify({
        sub: "oyakata@example.com",
        exp: Math.floor(Date.now() / 1000) - 1,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", SECRET)
      .update(expiredBody)
      .digest("base64url");

    expect(await readSessionValue(`${expiredBody}.${signature}`)).toBeNull();
  });

  it("形が違う値を渡しても落ちない", async () => {
    expect(await readSessionValue("not-a-session")).toBeNull();
    expect(await readSessionValue(".")).toBeNull();
    expect(await readSessionValue("...")).toBeNull();
  });

  it("鍵が未設定なら発行できない（既定値でごまかさない）", async () => {
    delete process.env.AUTH_SECRET;
    await expect(createSessionValue("oyakata@example.com")).rejects.toThrow(
      /AUTH_SECRET/,
    );
  });

  it("鍵が短すぎれば発行できない", async () => {
    process.env.AUTH_SECRET = "short";
    await expect(createSessionValue("oyakata@example.com")).rejects.toThrow(
      /AUTH_SECRET/,
    );
  });
});

describe("sessionCookieOptions", () => {
  it("JavaScript から読めない Cookie にする", () => {
    expect(sessionCookieOptions(SESSION_TTL_SECONDS).httpOnly).toBe(true);
  });

  it("他サイトからの遷移で送らせない", () => {
    expect(sessionCookieOptions(SESSION_TTL_SECONDS).sameSite).toBe("lax");
  });

  it("消すときは有効期間0にする", () => {
    expect(sessionCookieOptions(0).maxAge).toBe(0);
  });
});
