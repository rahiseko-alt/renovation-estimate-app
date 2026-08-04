import { describe, expect, it } from "vitest";

import { sanitizeNextPath } from "../lib/auth/next-path";

describe("sanitizeNextPath", () => {
  it("自サイトの相対パスはそのまま通す", () => {
    expect(sanitizeNextPath("/projects")).toBe("/projects");
    expect(sanitizeNextPath("/projects/123")).toBe("/projects/123");
    expect(sanitizeNextPath("/projects?tab=out")).toBe("/projects?tab=out");
  });

  it("値が無ければ既定値 / を返す", () => {
    expect(sanitizeNextPath(undefined)).toBe("/");
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath("")).toBe("/");
  });

  it("文字列でなければ既定値に倒す", () => {
    expect(sanitizeNextPath(123)).toBe("/");
    expect(sanitizeNextPath({})).toBe("/");
  });

  it("スキーム付きの外部URLは既定値に倒す（オープンリダイレクト対策）", () => {
    expect(sanitizeNextPath("https://evil.example/")).toBe("/");
    expect(sanitizeNextPath("http://evil.example")).toBe("/");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/");
  });

  it("プロトコル相対URL（//で始まる）は既定値に倒す", () => {
    // ブラウザは "//evil.example" をスキーム省略の外部URLとして解釈する
    expect(sanitizeNextPath("//evil.example")).toBe("/");
    expect(sanitizeNextPath("///evil.example")).toBe("/");
  });

  it("バックスラッシュ始まりは既定値に倒す", () => {
    // 一部のブラウザ実装は \\ をホスト区切りの / と同一視することがある
    expect(sanitizeNextPath("/\\evil.example")).toBe("/");
  });

  it("先頭が / でなければ既定値に倒す", () => {
    expect(sanitizeNextPath("projects")).toBe("/");
    expect(sanitizeNextPath("evil.example")).toBe("/");
  });
});
