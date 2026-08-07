// デモの受け入れ条件を実ブラウザで機械判定する。
//
// **条件は「docs/flows.md の『デモの画面の並び』D1〜D9 のとおりに進むこと」**。
// 商談で見せる相手はアカウントを持たず、PCにも不慣れなので、途中に設定画面・
// 入力欄・ログインが1つでも挟まると経路が壊れる。
//
// **画面もボタンも遷移も、表に無いものを作らないことが利用者との約束**（2026-08-07）。
// だからこの検査は「進めること」だけでなく「**表に無いボタンが出ていないこと**」も見る。
// 表を変えるときは、実装とこの検査を同時に直す。検査のほうを緩めない。
//
// 前提データを外から入れない。**デモは自分でデータを作るところまでが機能**なので、
// seed に頼ると「入口が壊れていても通る」検査になる（scripts/seed-demo.sh は使わない）。

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  COMPARISON_TEXT,
  DOCUMENT_CONFIRM_TEXT,
  QUOTE_DOCUMENT_TEXT,
  QUOTE_LIST_TEXT,
  RECEIVED_TEXT,
  SENT_TEXT,
} from "../lib/content";
import { DEMO_ENTRY_TEXT, DEMO_PHOTO_TEXT } from "../lib/demoText";
import { COMPANIES } from "../lib/demoFixture";

const PROJECT_ID = /\/projects\/[0-9a-f-]{36}/;

test("デモは D1 から D9 まで、表のとおりに進む", async ({ page }) => {
  // 商談中にコンソールへエラーが出る状態は「動いている」と言えない。
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  // ── D1 トップ ────────────────────────────────────────
  await page.goto("/");
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();

  // ── D2 写真を撮る ─────────────────────────────────────
  await expect(page).toHaveURL(/\/demo\/[0-9a-f-]{36}\/photo$/);
  await expect(page.getByRole("heading", { name: "現場の写真を撮る" })).toBeVisible();
  // カメラは実ブラウザの検査で扱えないので、逃げ道のほうを検査する。
  // 商談で写真が撮れない・上がらないときに通る経路がこれで、ここが死ぬとデモが止まる。
  await page.getByRole("button", { name: DEMO_PHOTO_TEXT.skip }).click();

  // ── D3 確認画面（はめ込んだ画像） ──────────────────────
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/document$`));
  await expect(
    page.getByRole("heading", { name: DOCUMENT_CONFIRM_TEXT.heading }),
  ).toBeVisible();
  // **操作は保存・送信・修正の3つだけ。** 表に無いものを足したらここで落ちる。
  // 画面を移るだけの保存・修正はリンク、サーバを呼ぶ送信はボタン（役割が違うのは意図的）。
  await expect(page.getByRole("link", { name: DOCUMENT_CONFIRM_TEXT.save })).toBeVisible();
  await expect(page.getByRole("link", { name: DOCUMENT_CONFIRM_TEXT.edit })).toBeVisible();
  await expect(page.getByRole("button", { name: DOCUMENT_CONFIRM_TEXT.send })).toBeVisible();
  await page.getByRole("button", { name: DOCUMENT_CONFIRM_TEXT.send }).click();

  // ── D4 送信しました（デモ）→ ロード中を挟んで自動で進む ──
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/sent$`));
  await expect(page.getByRole("heading", { name: SENT_TEXT.heading })).toBeVisible();
  await expect(page.getByText(SENT_TEXT.loading)).toBeVisible();

  // ── D5 受信しました（デモ） ────────────────────────────
  // ボタンを押さずに進むこと自体が条件なので、URL の変化を待つ。
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/received$`), {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: RECEIVED_TEXT.heading })).toBeVisible();
  await page.getByRole("link", { name: RECEIVED_TEXT.toQuotes }).click();

  // ── D7 下請け見積もり一覧 ───────────────────────────────
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/quotes$`));
  await expect(page.getByRole("heading", { name: QUOTE_LIST_TEXT.heading })).toBeVisible();
  // 3社ぶんが並んでいること（1社でも欠けたら比較にならない）。
  for (const { companyName } of COMPANIES) {
    await expect(page.getByText(companyName).first()).toBeVisible();
  }
  await expect(page.getByText(QUOTE_LIST_TEXT.empty)).toHaveCount(0);
  await page.getByRole("link", { name: QUOTE_LIST_TEXT.open }).first().click();

  // ── D6 見積もり書類（1社ずつ） ─────────────────────────
  await expect(page).toHaveURL(
    new RegExp(`${PROJECT_ID.source}/quotes/[0-9a-f-]{36}$`),
  );
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
  await expect(page.getByText(QUOTE_LIST_TEXT.adoptedMark).first()).toBeVisible();

  // ── D9 見積書PDF ──────────────────────────────────────
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
  // **比較表は表（D1〜D9）に無い画面**で、利用者はここを通らない。それでも開くのは、
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

test("D3 で「修正」を押すと、写真の画面に戻る", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
  await page.getByRole("button", { name: DEMO_PHOTO_TEXT.skip }).click();
  await expect(page).toHaveURL(new RegExp(`${PROJECT_ID.source}/document$`));

  await page.getByRole("link", { name: DOCUMENT_CONFIRM_TEXT.edit }).click();
  await expect(page).toHaveURL(/\/demo\/[0-9a-f-]{36}\/photo$/);
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
  await expect(page.getByRole("button", { name: DEMO_ENTRY_TEXT.start })).toBeVisible();
  // 商談で見せる相手に要らないものは、右上の引き出しの中（閉じている）。
  await expect(page.getByRole("link", { name: "案件" })).toBeHidden();

  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
  await expect(page).toHaveURL(/\/demo\/[0-9a-f-]{36}\/photo$/);
  const projectId = new URL(page.url()).pathname.split("/")[2];

  // デモ中（＝セッションを持っている状態）でも、トップは同じ。
  await page.goto("/");
  await expect(page.getByRole("button", { name: DEMO_ENTRY_TEXT.start })).toBeVisible();
  await expect(page.getByRole("link", { name: "案件" })).toBeHidden();

  // もう一度押せば自分のデモへ戻る（商談で見せ直せる）。
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
  await expect(page).toHaveURL(`/demo/${projectId}/photo`);
});

test("右上の丸を押すと、作る側の行き先が出る", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("開発者向け").click();
  await expect(page.getByRole("link", { name: "ログインする" })).toBeVisible();
});

test("デモの利用者に、実データの画面は空で見える", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
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
    await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
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
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
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
