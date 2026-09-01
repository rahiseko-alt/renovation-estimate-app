import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PROTECTED_PREFIXES, PUBLIC_PREFIXES } from "../proxy";

/**
 * proxy.ts の「ログインを要求する範囲」が、実在するルートとずれていないことを機械で止める。
 *
 * 2026-09-01 に、PROTECTED_PREFIXES が実在しない /estimates と /masters を挙げ、
 * 実在する /price-master を挙げていない状態が見つかった。/price-master/new は
 * 画面側の認証確認を持たないため、未ログインで開けていた
 * （送信は Server Action が弾くのでデータは漏れなかったが、塞がっていたのは偶然）。
 *
 * 「1箇所にだけ書く」と宣言した値が実物とずれても誰も気づかない、という同じ形の失敗が
 * このリポジトリで既に3件ある（AGENTS.md の文言マーカーの節）。ここは机上のレビューに
 * 任せず、ルートを足したら落ちるようにしておく。
 */

const APP_DIR = join(import.meta.dirname, "..", "app");

/** app/ 直下で、実際に URL を持つ（page.tsx か route.ts を配下に含む）セグメント。 */
function routeSegments(): string[] {
  const segments: string[] = [];
  for (const entry of readdirSync(APP_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (hasRouteFile(join(APP_DIR, entry.name))) segments.push(entry.name);
  }
  return segments.sort();
}

function hasRouteFile(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (hasRouteFile(join(dir, entry.name))) return true;
      continue;
    }
    if (entry.name === "page.tsx" || entry.name === "route.ts") return true;
  }
  return false;
}

describe("proxy の保護範囲", () => {
  it("挙げた接頭辞は、すべて実在するルートを指している", () => {
    const actual = routeSegments();
    for (const prefix of [...PROTECTED_PREFIXES, ...PUBLIC_PREFIXES]) {
      // 実在しない接頭辞は、守っているつもりで何も守っていない。
      expect(actual, `${prefix} に当たるルートが app/ に無い`).toContain(
        prefix.replace(/^\//, ""),
      );
    }
  });

  it("app/ の全セグメントが、保護か公開のどちらかに分類されている", () => {
    const classified = new Set(
      [...PROTECTED_PREFIXES, ...PUBLIC_PREFIXES].map((prefix) =>
        prefix.replace(/^\//, ""),
      ),
    );
    for (const segment of routeSegments()) {
      // 分類漏れは「誰でも開ける」に倒れる。足した本人に決めさせるためここで落とす。
      expect(
        classified.has(segment),
        `/${segment} が proxy.ts のどちらの一覧にも無い。` +
          `ログインを要求するなら PROTECTED_PREFIXES、誰でも開けてよいなら PUBLIC_PREFIXES に足す`,
      ).toBe(true);
    }
  });

  it("同じ接頭辞を保護と公開の両方に置いていない", () => {
    const publicSet = new Set(PUBLIC_PREFIXES);
    for (const prefix of PROTECTED_PREFIXES) {
      expect(publicSet.has(prefix), `${prefix} が両方の一覧にある`).toBe(false);
    }
  });

  it("単価マスタはログインを要求する（画面側の確認に頼らない）", () => {
    // /price-master/new は page.tsx に認証確認が無い。proxy が外れると無認証で開く。
    expect(PROTECTED_PREFIXES).toContain("/price-master");
  });
});
