// デモの受け入れ条件を実ブラウザで機械判定する。
//
// **条件は「docs/flows.md の『デモの画面の並び』D1〜D10 のとおりに進むこと」**。
// 商談で見せる相手はアカウントを持たず、PCにも不慣れなので、途中に設定画面・
// 入力欄・ログインが1つでも挟まると経路が壊れる。
//
// **画面もボタンも遷移も、表に無いものを作らないことが利用者との約束**（2026-08-07）。
// だからこの検査は「進めること」だけでなく「**表に無いボタンが出ていないこと**」も見る。
// 表を変えるときは、実装とこの検査を同時に直す。検査のほうを緩めない。
//
// 前提データを外から入れない。**デモは自分でデータを作るところまでが機能**なので、
// seed に頼ると「入口が壊れていても通る」検査になる（scripts/seed-demo.sh は使わない）。
//
// 文言はすべて定数から引く（lib/content.ts / lib/flowText.ts / lib/demoText.ts）。
// リテラルで書くと、文言を直したときにこの検査だけが古い文字を探し続ける。
//
// **入口と分離の検査（誰が入れるか・他人のデモを覗けないか）は demo-guard.spec.ts。**
// ここが持つのは、表のとおりに進めるかどうかだけ。

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  COMPARISON_TEXT,
  DEMO_RESTART_TEXT,
  DOCUMENT_CONFIRM_TEXT,
  NEW_PROJECT_TEXT,
  PHOTO_STEP_TEXT,
  PROJECT_STEP_TEXT,
  QUOTE_DOCUMENT_TEXT,
  QUOTE_LIST_TEXT,
  RECEIVED_TEXT,
  SENT_TEXT,
} from "../lib/content";
import { DEMO_ENTRY_TEXT, DEMO_PHOTO_TEXT } from "../lib/demoText";
import { COMPANIES, CUSTOMER_NAME, LINE_SOURCE } from "../lib/demoFixture";
import {
  DEMO_PHOTO_URL,
  DEMO_PROJECT_URL,
  expectRestartButton,
  PROJECT_ID,
  projectIdFromUrl,
} from "./demoScreens";
import { makePng } from "./makePng";

test("デモは D1 から D10 まで、表のとおりに進む", async ({ page }) => {
  // 商談中にコンソールへエラーが出る状態は「動いている」と言えない。
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  // ── D1 トップ ────────────────────────────────────────
  await page.goto("/");
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();

  // ── D2 案件をつくる ───────────────────────────────────
  await expect(page).toHaveURL(DEMO_PROJECT_URL);
  await expect(
    page.getByRole("heading", { name: PROJECT_STEP_TEXT.heading }),
  ).toBeVisible();

  // **見本が入った状態で開く**（利用者の回答 ③B。商談で打つ手間を減らすため）。
  // 空で開くと、商談の相手に打たせることになる。値そのものはデモの中身の都合で
  // 変わるので、ここで見るのは「空でない」こと。
  await expect(
    page.getByLabel(NEW_PROJECT_TEXT.customerNameLabel),
  ).not.toHaveValue("");
  await expect(
    page.getByLabel(NEW_PROJECT_TEXT.siteAddressLabel),
  ).not.toHaveValue("");

  // **ボタンは「次へ」1つだけ**（＋どの画面にもある「最初からやり直す」）。
  // 表に無いボタンを足したらここで落ちる。
  await expect(page.getByRole("button")).toHaveText([
    PROJECT_STEP_TEXT.next,
    DEMO_RESTART_TEXT.label,
  ]);
  await page.getByRole("button", { name: PROJECT_STEP_TEXT.next }).click();

  // ── D3 写真を撮る ─────────────────────────────────────
  await expect(page).toHaveURL(DEMO_PHOTO_URL);
  await expect(
    page.getByRole("heading", { name: DEMO_PHOTO_TEXT.heading }),
  ).toBeVisible();

  // **工事の枠が明細の数だけ並ぶ。** 箇所を選ばせる形をやめた理由がここで、
  // 枠＝明細行なので「どうやっても撮れない工事」が出ない（表 D3）。
  const frames = page.getByRole("button", { name: DEMO_PHOTO_TEXT.take });
  await expect(frames).toHaveCount(LINE_SOURCE.length);
  for (const line of LINE_SOURCE) {
    await expect(page.getByRole("button", { name: line.name })).toHaveCount(1);
  }
  // 出るのは 枠 ＋「写真なしで進む」＋「次へ」＋「最初からやり直す」だけ。
  await expect(page.getByRole("button")).toHaveCount(LINE_SOURCE.length + 3);
  await expectRestartButton(page);

  // **枠を押すと撮影になる。** 実ブラウザでもカメラは開けないので、撮影の入口
  // （ファイル選択）が開くところまでを見て、そこへ画像を渡す。
  const firstLine = LINE_SOURCE[0]!;
  const firstFrame = page.getByRole("button", { name: firstLine.name });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    firstFrame.click(),
  ]);
  await chooser.setFiles({
    name: "genba.png",
    mimeType: "image/png",
    buffer: makePng(),
  });

  // **渡した写真がその枠に入る。** 入らないと書類の枠が空のままになる
  // （docs/failures.md 2026-08-07「撮っても書類に入らなかった」）。
  await expect(
    page.getByAltText(PHOTO_STEP_TEXT.photoAlt(firstLine.name, 1)),
  ).toBeVisible();
  await expect(firstFrame).toContainText(PHOTO_STEP_TEXT.countLabel(1));
  // **撮っても画面は移らない**（続けて撮れることが条件。表 D3）。
  await expect(page).toHaveURL(DEMO_PHOTO_URL);

  await page.getByRole("button", { name: PHOTO_STEP_TEXT.next }).click();

  // ── D4 確認画面（はめ込んだ画像） ──────────────────────
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/document$`));
  await expect(
    page.getByRole("heading", { name: DOCUMENT_CONFIRM_TEXT.heading }),
  ).toBeVisible();

  // **見積回答期限が入った状態で開く**（初期値は当日＋7日。表 D4）。
  // 空欄で出していたときに、実機で「作りかけに見える」と言われた箇所。
  await expect(
    page.getByLabel(DOCUMENT_CONFIRM_TEXT.responseDueLabel),
  ).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

  // **操作は保存・送信・修正の3つだけ。** 表に無いものを足したらここで落ちる。
  // 画面を移るだけの保存・修正はリンク、サーバを呼ぶ送信はボタン（役割が違うのは意図的）。
  await expect(page.getByRole("link", { name: DOCUMENT_CONFIRM_TEXT.save })).toBeVisible();
  await expect(page.getByRole("link", { name: DOCUMENT_CONFIRM_TEXT.edit })).toBeVisible();
  await expect(page.getByRole("button", { name: DOCUMENT_CONFIRM_TEXT.send })).toBeVisible();
  await expectRestartButton(page);
  await page.getByRole("button", { name: DOCUMENT_CONFIRM_TEXT.send }).click();

  // ── D5 送信しました（デモ）→ ロード中を挟んで自動で進む ──
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/sent$`));
  await expect(page.getByRole("heading", { name: SENT_TEXT.heading })).toBeVisible();
  await expect(page.getByText(SENT_TEXT.loading)).toBeVisible();

  // ── D6 受信しました（デモ） ────────────────────────────
  // ボタンを押さずに進むこと自体が条件なので、URL の変化を待つ。
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/received$`), {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: RECEIVED_TEXT.heading })).toBeVisible();
  await expectRestartButton(page);
  await page.getByRole("link", { name: RECEIVED_TEXT.toQuotes }).click();

  // ── D7 下請け見積もり一覧 ───────────────────────────────
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/quotes$`));
  await expect(page.getByRole("heading", { name: QUOTE_LIST_TEXT.heading })).toBeVisible();
  // 3社ぶんが並んでいること（1社でも欠けたら比較にならない）。
  for (const { companyName } of COMPANIES) {
    await expect(page.getByText(companyName).first()).toBeVisible();
  }
  await expect(page.getByText(QUOTE_LIST_TEXT.empty)).toHaveCount(0);
  await expectRestartButton(page);

  // **一覧でも採用／保留が押せる**（利用者の指示 2026-08-07。実機で
  // 「一覧で押せない。詳細でしか押せない」と言われた）。押しても画面は移らない。
  const listHold = page.getByRole("button", { name: QUOTE_DOCUMENT_TEXT.hold }).first();
  const urlBeforeListMark = page.url();
  await listHold.click();
  await expect(listHold).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toBe(urlBeforeListMark);

  await page.getByRole("link", { name: QUOTE_LIST_TEXT.open }).first().click();

  // ── D8 見積もり書類（1社ずつ） ─────────────────────────
  await expect(page).toHaveURL(
    new RegExp(`${PROJECT_ID.source}/quotes/[0-9a-f-]{36}$`),
  );
  await expectRestartButton(page);
  const holdButtons = page.getByRole("button", { name: QUOTE_DOCUMENT_TEXT.hold });
  const adoptButtons = page.getByRole("button", { name: QUOTE_DOCUMENT_TEXT.adopt });
  await expect(holdButtons.first()).toBeVisible();
  await expect(adoptButtons.first()).toBeVisible();

  // **押しても画面は移らない**（1社ぶんの明細を続けて押せる、が条件）。
  const urlBeforeMark = page.url();
  await holdButtons.first().click();
  await expect(holdButtons.first()).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toBe(urlBeforeMark);

  // **保留は、あとで採用に変えられる。**
  await adoptButtons.first().click();
  await expect(adoptButtons.first()).toHaveAttribute("aria-pressed", "true");
  await expect(holdButtons.first()).toHaveAttribute("aria-pressed", "false");
  expect(page.url()).toBe(urlBeforeMark);

  // 画面が移るのは「一覧へ」を押したときだけ。
  await page.getByRole("link", { name: QUOTE_DOCUMENT_TEXT.toList }).click();
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/quotes$`));
  // D8 で押した採用が D7 に貯まっている。**一覧にも同じボタンがある**ので、
  // 文字があることではなく**押された状態**（aria-pressed）で見る。
  await expect(
    page
      .getByRole("button", { name: QUOTE_LIST_TEXT.adoptedMark, pressed: true })
      .first(),
  ).toBeVisible();

  // ── D10 見積書PDF ─────────────────────────────────────
  // **D7 の「見積書を出す」を押す。** これが表のとおりの経路（2026-08-07 に利用者が
  // 表へ足した）。以前はここで比較表へ page.goto していたが、比較表は表に無い画面で、
  // 利用者の経路を検査が勝手に作り替えていた。
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: QUOTE_LIST_TEXT.toPdf }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^estimate-.+\.pdf$/);

  const filePath = await download.path();
  if (!filePath) throw new Error("PDFのダウンロード先パスが取れない");
  const bytes = readFileSync(filePath);
  expect(bytes.byteLength).toBeGreaterThan(1_000);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // ── ここから先は検査専用。利用者の経路ではない ──────────
  // **比較表は表（D1〜D10）に無い画面**で、利用者はここを通らない。それでも開くのは、
  // **書類が全行0円で出る事故を外から捕まえる場所が他に無い**ため
  // （docs/failures.md 2026-08-06）。PDFのバイト列から金額は読めないので、
  // 同じ計算（lib/db/pricedEstimate.ts）を通る比較表の合計で金額だけを確かめる。
  // **D7 に合計を出す指示は表に無い**ので、D7 側に合計を足して済ませることはしない。
  const projectId = urlBeforeMark.match(/\/projects\/([0-9a-f-]{36})\//)?.[1];
  expect(projectId, `案件IDを取れない: ${urlBeforeMark}`).toBeTruthy();
  await page.goto(`/projects/${projectId}/comparison`);

  const totalRegion = page.getByRole("region", {
    name: COMPARISON_TEXT.adoptedTotalLabel,
  });
  await expect(totalRegion).toBeVisible();
  const totalText = await totalRegion.innerText();
  const totalYen = totalText.match(/([\d,]+)円/)?.[1];
  expect(totalYen, `合計を読めない: ${totalText}`).toBeTruthy();
  expect(Number(totalYen?.replace(/,/g, ""))).toBeGreaterThan(0);

  expect(consoleErrors).toEqual([]);
});

test("D4 で「修正」を押すと、写真の画面に戻る", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
  await page.getByRole("button", { name: PROJECT_STEP_TEXT.next }).click();
  await page.getByRole("button", { name: DEMO_PHOTO_TEXT.skip }).click();
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/document$`));

  await page.getByRole("link", { name: DOCUMENT_CONFIRM_TEXT.edit }).click();
  await expect(page).toHaveURL(DEMO_PHOTO_URL);
});

test("「最初からやり直す」を押すと、新しい案件になり、前に打った施主名が残らない", async ({
  page,
}) => {
  // 商談で次の相手に見せるための操作。**前の相手が打った内容が残っていたら使えない**
  // （利用者の回答 A①。2026-08-07）。
  await page.goto("/");
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
  await expect(page).toHaveURL(DEMO_PROJECT_URL);
  const first = projectIdFromUrl(page.url());

  // 前の相手が打った施主名（ダミー）。
  const typedName = "見本 花子";
  await page.getByLabel(NEW_PROJECT_TEXT.customerNameLabel).fill(typedName);
  await page.getByRole("button", { name: PROJECT_STEP_TEXT.next }).click();
  await expect(page).toHaveURL(DEMO_PHOTO_URL);

  // どの画面からでも切り替えられる（ここでは D3 から押す）。
  await page.getByRole("button", { name: DEMO_RESTART_TEXT.label }).click();

  // 最初の画面（D2）から、**新しい案件で**始まる。
  await expect(page).toHaveURL(DEMO_PROJECT_URL);
  expect(projectIdFromUrl(page.url()), "同じ案件が返っている").not.toBe(first);
  await expect(
    page.getByLabel(NEW_PROJECT_TEXT.customerNameLabel),
  ).not.toHaveValue(typedName);
  // 見本が入り直っている（作り直しが中途半端に終わっていない）。
  await expect(page.getByLabel(NEW_PROJECT_TEXT.customerNameLabel)).toHaveValue(
    CUSTOMER_NAME,
  );
});
