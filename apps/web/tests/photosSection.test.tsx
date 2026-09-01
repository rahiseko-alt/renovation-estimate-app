import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PhotosSection, type PhotoTargetLine } from "../components/PhotosSection";
import { PHOTO_AREAS, PHOTO_TEXT } from "../lib/content";

/**
 * 案件詳細の写真セクションが、**明細行ごとに撮る形**になっていることを見る。
 *
 * 2026-09-01 まで、この画面は「箇所」だけを選ばせて photos.line_id を送っていなかった。
 * 書類の側（lib/db/quoteRequestDoc.ts）は line_id が null の写真を捨てるので、
 * **デモの外では、撮った写真が1枚も見積依頼書に入らなかった**。写真自体は保存され
 * 案件詳細には並ぶので、黙って書類から落ちる壊れ方だった。
 *
 * 「箇所を選ばせる形」は 2026-08-07 にやめている（lib/content.ts の
 * photoAreaForLineName）。この画面がその移行から漏れていた。戻したら落とす。
 */

/** 箇所（PHOTO_AREAS）に対応する工事。 */
const IN_AREA_LINE: PhotoTargetLine = { id: "line-1", name: "内装工事" };
/** 箇所に対応が無い工事。「箇所を選ばせる形」では永久に撮れなかったもの。 */
const OUT_OF_AREA_LINE: PhotoTargetLine = {
  id: "line-2",
  name: "解体・廃棄物処理費",
};
const LINES: PhotoTargetLine[] = [IN_AREA_LINE, OUT_OF_AREA_LINE];

function render(lines: PhotoTargetLine[]): string {
  return renderToStaticMarkup(
    <PhotosSection projectId="project-1" initialPhotos={[]} lines={lines} />,
  );
}

describe("PhotosSection", () => {
  it("どの工事の写真かを選ばせる", () => {
    const html = render(LINES);
    expect(html).toContain(PHOTO_TEXT.lineLabel);
    expect(html).toContain('id="photo-line"');
  });

  it("選択肢は見積の明細行そのもの（箇所の一覧ではない）", () => {
    const html = render(LINES);
    for (const line of LINES) {
      expect(html).toContain(`value="${line.id}"`);
      expect(html).toContain(line.name);
    }
  });

  it("箇所を選ばせる欄を出さない（2026-08-07 にやめた形）", () => {
    const html = render(LINES);
    // 箇所の選択に戻すと、選択肢が8つしか無く、解体・廃棄物処理費のように
    // 対応する箇所が無い工事の写真が永久に撮れなくなる。
    expect(html).not.toContain('id="photo-area"');
  });

  it("撮る対象に「解体・廃棄物処理費」のような、箇所に無い工事も出せる", () => {
    const html = render(LINES);
    expect(PHOTO_AREAS).not.toContain(OUT_OF_AREA_LINE.name);
    expect(html).toContain(OUT_OF_AREA_LINE.name);
  });

  it("明細がまだ無ければ、撮らせずに先に見積を作るよう伝える", () => {
    const html = render([]);
    // 撮らせてから「入りませんでした」と言わない。
    expect(html).toContain(PHOTO_TEXT.noLinesYet);
    expect(html).not.toContain('id="photo-file"');
  });
});
