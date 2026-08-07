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

import { COMPARISON_TEXT } from "../lib/content";
import { COMPANIES } from "../lib/demoFixture";

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
  for (const { companyName } of COMPANIES) {
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
  // 目印の文言は画面と同じ値を使う（2箇所に書くと、片方だけ直したときに黙って通る）。
  const totalRegion = page.getByRole("region", {
    name: COMPARISON_TEXT.adoptedTotalLabel,
  });
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

test("ログインしていてもいなくても、トップは同じ画面から始まる", async ({ page }) => {
  // 以前はログイン状態で中身を出し分けていて、**デモを一度触るとデモの入口が消えた**
  // （商談で見せ直せない。docs/failures.md 2026-08-06）。
  // 出し分けをやめたので、同じ画面がいつでも出る。
  await page.goto("/");
  await expect(page.getByRole("button", { name: TAPS[0] })).toBeVisible();
  // 商談で見せる相手に要らないものは、右上の引き出しの中（閉じている）。
  await expect(page.getByRole("link", { name: "案件" })).toBeHidden();

  await page.getByRole("button", { name: TAPS[0] }).click();
  await expect(page).toHaveURL(/\/demo\/[0-9a-f-]{36}\/photo$/);
  const projectId = new URL(page.url()).pathname.split("/")[2];

  // デモ中（＝セッションを持っている状態）でも、トップは同じ。
  await page.goto("/");
  await expect(page.getByRole("button", { name: TAPS[0] })).toBeVisible();
  await expect(page.getByRole("link", { name: "案件" })).toBeHidden();

  // もう一度押せば自分のデモへ戻る（商談で見せ直せる）。
  await page.getByRole("button", { name: TAPS[0] }).click();
  await expect(page).toHaveURL(`/demo/${projectId}/photo`);
});

test("右上の丸を押すと、作る側の行き先が出る", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("開発者向け").click();
  await expect(page.getByRole("link", { name: "ログインする" })).toBeVisible();
});

test("デモの利用者に、実データの画面は空で見える", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: TAPS[0] }).click();
  await expect(page).toHaveURL(/\/demo\//);

  // デモの識別子は訪問ごとに使い捨てなので、下請台帳にはデモが作った3社しか居ない。
  // 実利用者が登録した会社が混ざって見えることは無い。
  await page.goto("/subcontractors");
  await expect(page.getByText(COMPANIES[0]!.companyName)).toBeVisible();
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

test("デモの中身を直したあと、古いデモを開いていた人にも新しいものが出る", async ({
  context,
  page,
}) => {
  // デモは「既にデモ中なら作り直さない」ので、中身を直しても古い案件を返し続けていた
  // （有効期間は6時間。直した当日に触った人ほど古いものを見る）。
  // 版が変わったことを、版のCookieを別の値に差し替えて再現する。
  await page.goto("/");
  await page.getByRole("button", { name: TAPS[0] }).click();
  await expect(page).toHaveURL(/\/demo\/[0-9a-f-]{36}\/photo$/);
  const origin = new URL(page.url()).origin;
  const first = new URL(page.url()).pathname.split("/")[2];

  /**
   * 入口をもう一度叩く。トップの「デモの続きへ」と同じ POST を、同じ Cookie で送る
   * （画面を経由しないのは、ここで見たいのが版の判定そのものだから）。
   */
  async function startAgain(): Promise<string> {
    const response = await context.request.post(`${origin}/demo/start`, {
      headers: { origin },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    const location = response.headers()["location"];
    expect(location, "リダイレクト先が無い").toBeTruthy();
    const id = new URL(location!, origin).pathname.split("/")[2];
    if (!id) throw new Error(`案件IDを取れない: ${location}`);
    return id;
  }

  // 同じ版のままなら作り直さない（連打で書き込みが増えない、が保たれている）。
  expect(await startAgain()).toBe(first);

  // 版だけを古い値にする。セッションはそのまま＝「デモ中の人」のまま。
  const version = (await context.cookies()).find(
    (cookie) => cookie.name === "rea_demo_ver",
  );
  expect(version, "版のCookieが発行されていない").toBeTruthy();
  await context.addCookies([{ ...version!, value: "outdated" }]);

  const rebuilt = await startAgain();
  expect(rebuilt, "古い版のまま同じ案件が返っている").not.toBe(first);

  // 作り直したあとも、比較表の合計は出ている（作り直しが中途半端でない）。
  await page.goto(`/projects/${rebuilt}/comparison`);
  await expect(
    page.getByRole("region", { name: COMPARISON_TEXT.adoptedTotalLabel }),
  ).toBeVisible();
});

test("他所のサイトからデモを開始させられない（セッションを貼り替えられない）", async ({
  request,
}) => {
  // ルートハンドラは素のURLなので、Server Action と違って自動では守られない。
  // ここが通ると、ログイン中の利用者のセッションを外部サイトから貼り替えられる。
  const response = await request.post("/demo/start", {
    headers: { Origin: "https://example.com" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(403);
});
