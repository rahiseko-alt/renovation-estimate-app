// デモの**入口と分離**を実ブラウザで機械判定する。
//
// 並びそのもの（D1〜D10 を順に踏めるか）は demo-flow.spec.ts が見る。こちらが見るのは
// **その並びに入れる人・入れない人の線引き**——商談が2件同時に走っても互いの案件が
// 見えないこと、始めていない訪問者が開けないこと、外部サイトから始めさせられないこと、
// トップがいつでも同じ画面から始まること。1つのファイルに混ぜると、
// 表（docs/flows.md「デモの画面の並び」）を直すたびに関係の無い検査まで読み直すことになる。
//
// 文言はすべて定数から引く（lib/content.ts / lib/demoText.ts）。リテラルで書くと、
// 文言を直したときにこの検査だけが古い文字を探し続ける。

import { expect, test } from "@playwright/test";

import {
  AUTH_TEXT,
  COMPARISON_TEXT,
  DEVELOPER_PANEL_TEXT,
  HOME_DESTINATIONS,
} from "../lib/content";
import { DEMO_ENTRY_TEXT } from "../lib/demoText";
import { COMPANIES } from "../lib/demoFixture";
import {
  DEMO_PROJECT_URL,
  demoPhotoPath,
  demoProjectPath,
  projectIdFromUrl,
} from "./demoScreens";

/** 引き出しの中にしまってある行き先（商談の相手に出さないもの）。 */
const HIDDEN_DESTINATION = HOME_DESTINATIONS[0]!.label;

test("デモを始めていない訪問者は、デモの画面を開けない", async ({ page }) => {
  // 案件IDの形が合っているだけでは開かない。商談が同時に2件走っても、
  // URLを知っただけでは相手のデモを覗けない。
  const strangerId = "00000000-0000-4000-8000-000000000000";
  for (const path of [
    demoProjectPath(strangerId),
    demoPhotoPath(strangerId),
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} は 404 でなければならない`).toBe(404);
  }
});

test("ログインしていてもいなくても、トップは同じ画面から始まる", async ({ page }) => {
  // 以前はログイン状態で中身を出し分けていて、**デモを一度触るとデモの入口が消えた**
  // （商談で見せ直せない。docs/failures.md 2026-08-06）。
  // 出し分けをやめたので、同じ画面がいつでも出る。
  await page.goto("/");
  await expect(page.getByRole("button", { name: DEMO_ENTRY_TEXT.start })).toBeVisible();
  // 商談で見せる相手に要らないものは、右上の引き出しの中（閉じている）。
  await expect(page.getByRole("link", { name: HIDDEN_DESTINATION })).toBeHidden();

  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
  await expect(page).toHaveURL(DEMO_PROJECT_URL);
  const projectId = projectIdFromUrl(page.url());

  // デモ中（＝セッションを持っている状態）でも、トップは同じ。
  await page.goto("/");
  await expect(page.getByRole("button", { name: DEMO_ENTRY_TEXT.start })).toBeVisible();
  await expect(page.getByRole("link", { name: HIDDEN_DESTINATION })).toBeHidden();

  // もう一度押せば自分のデモへ戻る（商談で見せ直せる）。
  await page.getByRole("button", { name: DEMO_ENTRY_TEXT.start }).click();
  await expect(page).toHaveURL(demoProjectPath(projectId));
});

test("右上の丸を押すと、作る側の行き先が出る", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(DEVELOPER_PANEL_TEXT.open).click();
  await expect(page.getByRole("link", { name: AUTH_TEXT.submit })).toBeVisible();
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
    await expect(page).toHaveURL(DEMO_PROJECT_URL);
    const projectId = projectIdFromUrl(page.url());
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
      demoProjectPath(projectB),
      demoPhotoPath(projectB),
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
  await expect(page).toHaveURL(DEMO_PROJECT_URL);
  const origin = new URL(page.url()).origin;
  const first = projectIdFromUrl(page.url());

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
    return projectIdFromUrl(new URL(location!, origin).toString());
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
