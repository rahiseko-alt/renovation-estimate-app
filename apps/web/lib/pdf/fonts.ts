// PDF埋め込み用フォントの読み込み。BIZ UDPGothic（OFLライセンス。同梱の
// lib/pdf/assets/OFL.txt を参照）。慶大中野研の可読性の実測エビデンスがある
// UDフォントで、UI側の第一候補（AGENTS.md想定）と揃えている。
//
// @cantoo/pdf-lib（pdf-lib のフォーク）+ fontkit（@pdf-lib/fontkit ではなく
// 本家パッケージ）の組み合わせで使う。本家 pdf-lib + @pdf-lib/fontkit は、この
// フォントの日本語グリフをサブセット化すると一部の文字が欠落する不具合を
// 実機検証で確認したため採用していない。

import fs from "node:fs";
import path from "node:path";

const FONT_DIR = path.join(process.cwd(), "lib/pdf/assets");

let regularBytes: Buffer | null = null;
let boldBytes: Buffer | null = null;

export function loadRegularFontBytes(): Buffer {
  regularBytes ??= fs.readFileSync(
    path.join(FONT_DIR, "BIZUDPGothic-Regular.ttf"),
  );
  return regularBytes;
}

export function loadBoldFontBytes(): Buffer {
  boldBytes ??= fs.readFileSync(path.join(FONT_DIR, "BIZUDPGothic-Bold.ttf"));
  return boldBytes;
}
