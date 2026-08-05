import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// scripts/e2e.sh がこの検査の中だけで使い捨てる値を用意する（本物の秘密情報ではない。
// AGENTS.md「秘密情報」対象外1）。無ければ検査そのものが無意味なので、先に落とす。
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL;
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD;
if (!DEMO_USER_EMAIL || !DEMO_USER_PASSWORD) {
  throw new Error(
    "DEMO_USER_EMAIL / DEMO_USER_PASSWORD が未設定。scripts/e2e.sh 経由で実行すること。",
  );
}

// playwright.config.ts の cwd（apps/web）基準。webServer と同じ前提で解決する。
const PHOTO_FIXTURE = join(__dirname, "../public/icon-192.png");

const ITEM_NAME = "テスト工事";
const COST_UNIT_PRICE = 8_000;
const MARKUP_RATE = "1.25";
const EXPECTED_SELLING_UNIT_PRICE = 10_000; // 8,000 × 1.25

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(DEMO_USER_EMAIL!);
  await page.getByLabel("パスワード").fill(DEMO_USER_PASSWORD!);
  await page.getByRole("button", { name: "ログインする" }).click();
  // ログイン成功後の遷移先はトップ画面（HomeScreen）。ログイン状態でしか出ない
  // 「ログアウト」ボタンで、ログインが通ったことを確かめる。
  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
}

async function createProject(page: Page): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel("施主名").fill("テスト太郎");
  await page.getByLabel("現場住所").fill("東京都千代田区1-1-1");
  await page.getByRole("button", { name: "登録する" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const id = page.url().match(/\/projects\/([^/]+)$/)?.[1];
  if (!id) throw new Error(`案件詳細のURLから id を取れない: ${page.url()}`);
  return id;
}

async function uploadPhoto(page: Page): Promise<void> {
  await page.getByLabel("写真を撮る・選ぶ").setInputFiles(PHOTO_FIXTURE);
  await page.getByRole("button", { name: "追加する" }).click();
  // クライアント側で圧縮してから送るため、送信完了まで少し待つ必要がある。
  await expect(page.getByRole("heading", { name: "キッチン", level: 3 })).toBeVisible({
    timeout: 20_000,
  });
}

/** 見積エディタで明細を1行追加し、保存する。追加した行（li）を返す。 */
async function addEstimateLine(page: Page) {
  await page.getByRole("button", { name: "明細を追加" }).click();
  const row = page.locator("li").last();
  await row.getByLabel("工事項目").fill(ITEM_NAME);
  await row.getByLabel("数量").fill("10");
  await row.getByLabel("単位").selectOption({ label: "㎡" });
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("保存しました。")).toBeVisible();
  return row;
}

/** 明細行から下請への依頼リンクを発行し、発行されたURLを返す。 */
async function requestQuote(
  row: ReturnType<Page["locator"]>,
): Promise<string> {
  await row.getByRole("button", { name: "下請に単価を頼む" }).click();
  await row.getByLabel("掛率").fill(MARKUP_RATE);
  await row.getByRole("button", { name: "リンクを発行する" }).click();
  await expect(row.getByText("このリンクを下請に送ってください。")).toBeVisible();
  const link = await row.locator("p", { hasText: /^http/ }).textContent();
  if (!link) throw new Error("発行されたリンクが読めない");
  return link.trim();
}

/** 下請（ログインしていない別ブラウザコンテキスト）として原価単価を回答する。 */
async function respondAsSubcontractor(
  page: Page,
  link: string,
): Promise<void> {
  await page.goto(link);
  await page.getByLabel("原価単価（円）").fill(String(COST_UNIT_PRICE));
  await page.getByRole("button", { name: "回答する" }).click();
  await expect(page.getByText("回答しました。ありがとうございました。")).toBeVisible();

  // 同じリンクを開き直しても、二重回答はできない（回答済み画面に変わる）。
  await page.goto(link);
  await expect(
    page.getByText("この依頼は既に回答済みです。ご協力ありがとうございました。"),
  ).toBeVisible();
}

async function importQuoteResponse(page: Page): Promise<void> {
  await page.reload();
  const quoteRow = page
    .getByRole("listitem")
    .filter({ hasText: ITEM_NAME })
    .filter({ hasText: "回答あり" });
  await expect(quoteRow).toBeVisible();
  await quoteRow.getByRole("button", { name: "取り込む" }).click();
  // インポート成功後、画面は window.location.reload() で作り直される。
  await expect(
    page.locator(`input[value="${EXPECTED_SELLING_UNIT_PRICE}"]`),
  ).toBeVisible({ timeout: 15_000 });
}

async function downloadPdf(page: Page): Promise<void> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "見積書PDFを出力" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^estimate-.+\.pdf$/);

  const filePath = await download.path();
  if (!filePath) throw new Error("PDFのダウンロード先パスが取れない");
  const bytes = readFileSync(filePath);
  expect(bytes.byteLength).toBeGreaterThan(1_000);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
}

// 現場作業者が実際にたどる一連の流れ：写真→明細→下請依頼→取り込み→見積書PDF。
// AGENTS.md フェーズ4の受け入れ条件（一連の流れを通しで操作できること）を
// 機械判定する。手元・CI とも scripts/e2e.sh から実行する。
test("写真→明細→下請依頼→取り込み→見積書PDFまでの一連の流れ", async ({
  page,
  browser,
}) => {
  await login(page);
  const projectId = await createProject(page);
  await uploadPhoto(page);

  await page.goto(`/projects/${projectId}/estimate`);
  const row = await addEstimateLine(page);
  const link = await requestQuote(row);

  const subcontractorContext = await browser.newContext();
  try {
    const subcontractorPage = await subcontractorContext.newPage();
    await respondAsSubcontractor(subcontractorPage, link);
  } finally {
    await subcontractorContext.close();
  }

  await importQuoteResponse(page);
  await downloadPdf(page);
});
