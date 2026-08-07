// 撮った写真が、見積依頼書の枠に入るところまでを通しで見る。
//
// **モックにしない。** ローカル Supabase に実際に行とオブジェクトを作り、
// getQuoteRequestDocData（保存の層）で組み立てたデータを DocumentView（書類の層）で
// 描いて、枠に入った枚数を数える。実機で「撮っても書類に1枚も出ない」が起きたのは、
// 写真に line_id が付いていなかったからで、その結びつきはここでしか機械判定できない
// （型は Record<string, string[]> のままでも、中身が空なら気付けない）。

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

import { lineIdByPhotoArea, PHOTO_MAX_PER_AREA, WORK_AREAS } from "../lib/content";
import { saveEstimate } from "../lib/db/estimates";
import { createPhoto } from "../lib/db/photos";
import {
  deletePhotoObject,
  newPhotoStoragePath,
  uploadPhotoObject,
} from "../lib/db/photoStorage";
import { createProject } from "../lib/db/projects";
import { getQuoteRequestDocData } from "../lib/db/quoteRequestDoc";
import type { PersistedEstimateLine, Project } from "../lib/db/types";
import { DocumentView } from "../lib/doc/render/html";
import type { DocData } from "../lib/doc/schema";
import { QUOTE_REQUEST_TEMPLATE } from "../lib/doc/templates/quote-request";

const OWNER = "owner-quote-doc@example.com";

/** 撮った写真の代わりに置く最小のJPEG（マーカーだけ）。 */
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

/** 後片付けのために、この検査が置いたオブジェクトのパスを覚えておく。 */
const uploadedPaths: string[] = [];

afterAll(async () => {
  await Promise.all(uploadedPaths.map((path) => deletePhotoObject(path)));
});

function persistedLine(name: string): PersistedEstimateLine {
  return {
    id: crypto.randomUUID(),
    kind: "item",
    name,
    spec: "",
    quantity: 1,
    unit: "㎡",
    unitPrice: 0,
    taxCategory: "standard",
  };
}

/**
 * WORK_AREAS の先頭2つの工事項目名で明細を持つ案件を作る。
 * 名前を直接書かないのは、箇所と明細の対応が WORK_AREAS の itemName だけを
 * 根拠にしていることを、検査の側でも同じ出所から引くため。
 */
async function newProjectWithLines(): Promise<{
  project: Project;
  lines: PersistedEstimateLine[];
}> {
  const project = await createProject(
    { customerName: "テスト施主", siteAddress: "テスト住所" },
    OWNER,
  );
  const lines = [
    persistedLine(WORK_AREAS[0]!.itemName),
    persistedLine(WORK_AREAS[1]!.itemName),
  ];
  await saveEstimate(project.id, lines, 0);
  return { project, lines };
}

/** 実オブジェクトを置いてから photos の行を作る（アプリの保存と同じ順序）。 */
async function addPhoto(
  projectId: string,
  area: string,
  lineId: string | null,
): Promise<void> {
  const path = newPhotoStoragePath(projectId, "image/jpeg");
  await uploadPhotoObject(
    path,
    new File([JPEG_BYTES], "photo.jpg", { type: "image/jpeg" }),
  );
  uploadedPaths.push(path);
  await createPhoto({ projectId, area, lineId, storagePath: path }, OWNER);
}

function renderDoc(data: DocData): string {
  return renderToStaticMarkup(
    <DocumentView
      template={QUOTE_REQUEST_TEMPLATE}
      data={data}
      audience="subcontractor"
    />,
  );
}

function countOf(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

describe("箇所と明細行の対応", () => {
  it("箇所の工事項目名と同じ名前の明細行に結びつく。無い箇所は null", () => {
    const lines = [
      persistedLine(WORK_AREAS[0]!.itemName),
      persistedLine("この名前の箇所は無い"),
    ];
    const byArea = lineIdByPhotoArea(lines);

    expect(byArea[WORK_AREAS[0]!.area]).toBe(lines[0]!.id);
    // 対応する明細が無い箇所は null のまま。**明細を増やして埋めない。**
    expect(byArea[WORK_AREAS[1]!.area]).toBeNull();
  });
});

describe("見積依頼書に写真が入る（ローカル Supabase の実データ）", () => {
  it("明細行に結びつけて保存した写真は、その明細の枠に入る", async () => {
    const { project, lines } = await newProjectWithLines();
    await addPhoto(project.id, WORK_AREAS[0]!.area, lines[0]!.id);

    const data = await getQuoteRequestDocData(project, OWNER);
    expect(data.photoUrlByLineId[lines[0]!.id]).toHaveLength(1);
    // 撮っていない明細は空のまま（他の行に流れ込まない）。
    expect(data.photoUrlByLineId[lines[1]!.id] ?? []).toHaveLength(0);

    const html = renderDoc(data);
    // 枠は明細の数だけ。写真は撮った1枚だけが枠の中に出る。
    expect(countOf(html, /doc-photo-frame/g)).toBe(lines.length);
    expect(countOf(html, /<img/g)).toBe(1);
    expect(html).toContain(data.photoUrlByLineId[lines[0]!.id]![0]!);
  });

  it(`1つの明細には ${PHOTO_MAX_PER_AREA} 枚まで出る（それより多く撮っても増えない）`, async () => {
    const { project, lines } = await newProjectWithLines();
    // 上限より1枚多く撮る。**保存は止めない**（撮り直しができなくなる）ので、
    // 枠に出る枚数のほうで上限を守る。
    for (let i = 0; i < PHOTO_MAX_PER_AREA + 1; i += 1) {
      await addPhoto(project.id, WORK_AREAS[0]!.area, lines[0]!.id);
    }

    const data = await getQuoteRequestDocData(project, OWNER);
    expect(data.photoUrlByLineId[lines[0]!.id]).toHaveLength(PHOTO_MAX_PER_AREA);

    const html = renderDoc(data);
    expect(countOf(html, /doc-photo-frame/g)).toBe(lines.length);
    expect(countOf(html, /<img/g)).toBe(PHOTO_MAX_PER_AREA);
  });

  it("明細行に結びついていない写真は、どの枠にも入らない（空の点線枠のまま）", async () => {
    const { project, lines } = await newProjectWithLines();
    // 対応する明細が無い箇所で撮ると、この状態になる（lineId は null）。
    await addPhoto(project.id, WORK_AREAS[2]!.area, null);

    const data = await getQuoteRequestDocData(project, OWNER);
    expect(Object.values(data.photoUrlByLineId).flat()).toHaveLength(0);

    const html = renderDoc(data);
    // 枠は明細の数だけ出るが、中身は無い。
    expect(countOf(html, /doc-photo-frame/g)).toBe(lines.length);
    expect(countOf(html, /<img/g)).toBe(0);
  });
});
