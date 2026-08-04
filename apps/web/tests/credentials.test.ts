import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyCredentials } from "../lib/auth/credentials";

const EMAIL = "oyakata@example.com";
const PASSWORD = "correct-horse-battery-staple";

beforeEach(() => {
  process.env.DEMO_USER_EMAIL = EMAIL;
  process.env.DEMO_USER_PASSWORD = PASSWORD;
});

afterEach(() => {
  delete process.env.DEMO_USER_EMAIL;
  delete process.env.DEMO_USER_PASSWORD;
});

describe("verifyCredentials", () => {
  it("正しい組み合わせなら利用者を返す", async () => {
    expect(await verifyCredentials(EMAIL, PASSWORD)).toBe(EMAIL);
  });

  it("大文字と前後の空白は無視する（現場で打ち間違えるため）", async () => {
    expect(await verifyCredentials("  OYAKATA@Example.com ", PASSWORD)).toBe(EMAIL);
  });

  it("パスワードが違えば null", async () => {
    expect(await verifyCredentials(EMAIL, "wrong")).toBeNull();
  });

  it("メールアドレスが違えば null", async () => {
    expect(await verifyCredentials("someone@example.com", PASSWORD)).toBeNull();
  });

  it("パスワードは空白を落とさない（パスワードの一部として扱う）", async () => {
    expect(await verifyCredentials(EMAIL, ` ${PASSWORD} `)).toBeNull();
  });

  it("空の入力を通さない", async () => {
    expect(await verifyCredentials("", "")).toBeNull();
  });

  it("設定が無ければ例外を投げる（誰でも入れる状態にしない）", async () => {
    delete process.env.DEMO_USER_PASSWORD;
    await expect(verifyCredentials(EMAIL, PASSWORD)).rejects.toThrow(
      /DEMO_USER_EMAIL \/ DEMO_USER_PASSWORD/,
    );
  });
});
