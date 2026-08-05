import { afterEach, describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, createNonce } from "../lib/security/csp";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_SUPABASE_URL = process.env.SUPABASE_URL;

// Next.js の型定義で process.env.NODE_ENV は readonly になっている
// （実行時は普通に書き換えられる）。テストからの一時的な差し替えは
// 型だけ書き換え可能とみなしてキャストする。
function setNodeEnv(value: string): void {
  (process.env as { NODE_ENV: string }).NODE_ENV = value;
}

afterEach(() => {
  setNodeEnv(ORIGINAL_NODE_ENV ?? "test");
  if (ORIGINAL_SUPABASE_URL === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = ORIGINAL_SUPABASE_URL;
  }
});

describe("createNonce", () => {
  it("毎回別の値を作る", () => {
    const values = new Set(Array.from({ length: 20 }, () => createNonce()));
    expect(values.size).toBe(20);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("script-src に 'unsafe-inline' を入れない", () => {
    setNodeEnv("production");
    const csp = buildContentSecurityPolicy("abc");
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("nonce を script-src に含める", () => {
    const csp = buildContentSecurityPolicy("the-nonce-value");
    expect(csp).toContain("'nonce-the-nonce-value'");
  });

  it("本番では 'unsafe-eval' を入れない", () => {
    setNodeEnv("production");
    const csp = buildContentSecurityPolicy("abc");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("開発時（NODE_ENV が production 以外）は 'unsafe-eval' を入れる（React の開発時デバッグ機能が eval を使うため）", () => {
    setNodeEnv("development");
    const csp = buildContentSecurityPolicy("abc");
    expect(csp).toContain("'unsafe-eval'");
  });

  it("frame-ancestors 'none' を含める", () => {
    const csp = buildContentSecurityPolicy("abc");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("img-src に SUPABASE_URL のオリジンを含める（写真は署名付きURLで読むため）", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    const csp = buildContentSecurityPolicy("abc");
    const imgSrc = csp.split(";").find((d) => d.trim().startsWith("img-src"));
    expect(imgSrc).toContain("https://example.supabase.co");
  });

  it("SUPABASE_URL が未設定でも img-src は 'self' data: blob: のまま壊れない", () => {
    delete process.env.SUPABASE_URL;
    const csp = buildContentSecurityPolicy("abc");
    const imgSrc = csp.split(";").find((d) => d.trim().startsWith("img-src"));
    expect(imgSrc?.trim()).toBe("img-src 'self' data: blob:");
  });
});
