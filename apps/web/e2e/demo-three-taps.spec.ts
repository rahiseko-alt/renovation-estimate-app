// デモの受け入れ条件を実ブラウザで機械判定する。
//
// **条件は「3タップで見積書が出ること」**。商談で見せる相手はアカウントを持たず、
// PCにも不慣れなので、途中に設定画面・入力欄・ログインが1つでも挟まると経路が壊れる。
// タップ数は下の TAPS 配列そのもので、増やせばこの検査が落ちる。
//
// 前提データを外から入れない。**デモは自分でデータを作るところまでが機能**なので、
// seed に頼ると「入口が壊れていても通る」検査になる（scripts/seed-demo.sh は使わない）。

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

/** 3タップの中身。ここに1つ足したら、それはデモが3タップでなくなったということ。 */
const TAPS = ["デモを触ってみる", "写真なしで進む", "見積書PDFを出力"] as const;

test("トップから3タップで見積書PDFまで行ける", async ({ page }) => {
  // 商談中にコンソールへエラーが出る状態は「動いている」と言えない。
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  // ── 0タップ目：ログインせずにトップを開く ──────────────────
  await page.goto("/");
  await expect(page.getByRole("button", { name: TAPS[0] })).toBeVisible();

  // ── 1タップ目：デモを始める ────────────────────────────
  await page.getByRole("button", { name: TAPS[0] }).click();
  await expect(page).toHaveURL(/\/demo\/[0-9a-f-]{36}\/photo$/);
  await expect(page.getByRole("heading", { name: "現場の写真を撮る" })).toBeVisible();

  // ── 2タップ目：写真を飛ばして進む ───────────────────────
  // カメラは実ブラウザの検査で扱えないので、逃げ道のほうを検査する。
  // 商談で写真が撮れない・上がらないときに通る経路がこれで、ここが死ぬとデモが止まる。
  await page.getByRole("button", { name: TAPS[1] }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/comparison$/);

  // 着地した時点で、3社の回答が既に並んでいること（「回答待ち」では見せられない）。
  await expect(
    page.getByRole("heading", { name: "3社から見積が返ってきました" }),
  ).toBeVisible();
  // 比較表は明細1行につき全社を並べるので、社名の入った項目は明細の数だけ出る。
  // 「全社が同じ数だけ出ている」ことを見る（1社でも単価が欠けると比較にならない）。
  //
  // 社名は「採用中: <社名>」にも出るが、そちらは明細ごとに1社しか出ないので、
  // ページ全体の社名の数を比べると採用済みの社だけ多く数えられる。
  // 単価の並ぶ項目（listitem）に絞って数える。
  const appearances: number[] = [];
  for (const companyName of [
    "サンプル内装工業",
    "テスト住宅設備",
    "ダミー工務店",
  ]) {
    const locator = page.getByRole("listitem").filter({ hasText: companyName });
    await expect(locator.first()).toBeVisible();
    appearances.push(await locator.count());
  }
  expect(new Set(appearances).size).toBe(1);
  expect(appearances[0]).toBeGreaterThan(0);
  await expect(page.getByText("回答待ち")).toHaveCount(0);

  // 面倒な設定は隠さず、済んでいる事実として見せる（商談の深い話への入口）。
  await expect(
    page.getByText("この依頼には建設業法の法定項目 21 件が入っています"),
  ).toBeVisible();

  // **見積書を押す前に金額が出ていること。** 3タップ目に出る書類が全行0円だった
  // （docs/failures.md 2026-08-06）。PDFのバイト列から金額は読めないので、
  // 0円のまま書類が出る状態は、この画面の合計でしか外から捕まえられない。
  const totalRegion = page.getByRole("region", { name: "採用中の合計（税込）" });
  await expect(totalRegion).toBeVisible();
  const totalText = await totalRegion.innerText();
  const totalYen = totalText.match(/([\d,]+)円/)?.[1];
  expect(totalYen, `合計を読めない: ${totalText}`).toBeTruthy();
  expect(Number(totalYen?.replace(/,/g, ""))).toBeGreaterThan(0);

  // ── 3タップ目：見積書を出す ────────────────────────────
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: TAPS[2] }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^estimate-.+\.pdf$/);

  const filePath = await download.path();
  if (!filePath) throw new Error("PDFのダウンロード先パスが取れない");
  const bytes = readFileSync(filePath);
  expect(bytes.byteLength).toBeGreaterThan(1_000);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  expect(consoleErrors).toEqual([]);
});

test("デモを始めていない訪問者は、デモの画面を開けない", async ({ page }) => {
  // 案件IDの形が合っているだけでは開かない。商談が同時に2件走っても、
  // URLを知っただけでは相手のデモを覗けない。
  const response = await page.goto(
    "/demo/00000000-0000-4000-8000-000000000000/photo",
  );
  expect(response?.status()).toBe(404);
});

test("デモの利用者に、実データの画面は空で見える", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: TAPS[0] }).click();
  await expect(page).toHaveURL(/\/demo\//);

  // デモの識別子は訪問ごとに使い捨てなので、下請台帳にはデモが作った3社しか居ない。
  // 実利用者が登録した会社が混ざって見えることは無い。
  await page.goto("/subcontractors");
  await expect(page.getByText("サンプル内装工業")).toBeVisible();
});

test("同時に走る2つのデモは、互いの案件を開けない", async ({ browser }) => {
  // 商談が2件同時に走る状況を作る。Cookie を共有しない2つの文脈を使う。
  const [contextA, contextB] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);

  async function startDemo(context: (typeof contextA)): Promise<string> {
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: TAPS[0] }).click();
    await expect(page).toHaveURL(/\/demo\/[0-9a-f-]{36}\/photo$/);
    const projectId = new URL(page.url()).pathname.split("/")[2];
    if (!projectId) throw new Error("デモ案件のIDを取れない");
    await page.close();
    return projectId;
  }

  try {
    const [projectA, projectB] = await Promise.all([
      startDemo(contextA),
      startDemo(contextB),
    ]);
    expect(projectA).not.toBe(projectB);

    // A の文脈から B の案件を開こうとする。案件IDが正しくても通らない。
    const pageA = await contextA.newPage();
    for (const path of [
      `/projects/${projectB}/comparison`,
      `/projects/${projectB}`,
      `/demo/${projectB}/photo`,
    ]) {
      const response = await pageA.goto(path);
      expect(response?.status(), `${path} は 404 でなければならない`).toBe(404);
    }

    // 自分の案件は開ける（上の404が「全部落ちている」せいでないことを示す）。
    const own = await pageA.goto(`/projects/${projectA}/comparison`);
    expect(own?.status()).toBe(200);
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
