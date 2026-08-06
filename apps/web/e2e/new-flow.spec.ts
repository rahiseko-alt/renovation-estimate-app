// 新設計（docs/plan-rebuild.md PR-C）の画面に対するE2E。
//
// 旧モデル（1明細＝1依頼）の経路は e2e/full-flow.spec.ts が引き続き検査する。
// あちらは触らない（旧経路がまだ生きているので、壊れていないことの検査として残す）。
//
// ここが検査するのは PR-C の受け入れ条件のうち、実ブラウザでしか踏めないもの：
// C8/C9（比較表と採用の排他）／C2/C4（下請に見せるもの・見せないもの）／
// 書類画面のシート入力（PR-B の S2〜S4 に相当する経路）／C11（ブラウザのエラー0件）。
//
// 前提データは scripts/seed-demo.sh が入れる（scripts/e2e.sh が Playwright の前に実行し、
// 失敗したらここまで来ない）。下の期待値はその seed（apps/web/lib/db/demoSeed.ts）と
// 対になっている。seed を変えたらここも直す。

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// scripts/e2e.sh がこの検査の中だけで使い捨てる値を用意する（本物の秘密情報ではない。
// AGENTS.md「秘密情報」対象外1）。無ければ検査そのものが無意味なので、先に落とす。
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL;
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD;
// 依頼トークンは画面に出ない（元請の画面はリンクを一覧しない）ので、DBから引く。
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (
  !DEMO_USER_EMAIL ||
  !DEMO_USER_PASSWORD ||
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    "DEMO_USER_EMAIL / DEMO_USER_PASSWORD / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定。scripts/e2e.sh 経由で実行すること。",
  );
}

/** seed が作るデモ案件の施主名。案件一覧はこの名前で並ぶので、そこから開く。 */
const DEMO_CUSTOMER_NAME = "見本 太郎";
/** seed が作るデモ案件の現場住所（＝法定②施工場所）。下請にも出す義務がある。 */
const DEMO_SITE_ADDRESS = "東京都新宿区西新宿0-0-0 サンプルマンション101";
/** seed の明細は4行。採用しても行が増えないことの基準値（C8）。 */
const DEMO_LINE_COUNT = 4;
/** 比較に使う明細。seed の LINE_SOURCE の1行目（apps/web/lib/demoFixture.ts）。 */
const DEMO_LINE_NAME = "内装工事";
/**
 * seed の3社と、その社が DEMO_LINE_NAME に付けた原価単価。
 * 表示は formatYen（toLocaleString("ja-JP")）なので3桁区切りになる。
 *
 * 先頭の2社は、この明細を**採用済みでない**社であること。
 * 下でこの2社を順に採用して排他を見るので、最初から採用中だと「採用する」が出ない
 * （どの社を採用済みにするかは lib/demoFixture.ts の LINE_SOURCE[].adoptedBy）。
 */
const DEMO_QUOTES = [
  { companyName: "サンプル内装工業", unitPrice: 3_200, displayed: "3,200" },
  { companyName: "テスト住宅設備", unitPrice: 3_500, displayed: "3,500" },
  { companyName: "ダミー工務店", unitPrice: 2_980, displayed: "2,980" },
] as const;

/**
 * 下請の回答画面に出てはいけない文字列（C2）。
 * 施主名は法定8項目に含まれない。金額（自社・他社の単価）が渡ると相見積の前提が崩れる
 * （docs/design.md 7章「下請に見せるもの・見せないもの」）。
 * 3桁区切りの表記と生の数字の両方を見る（どちらの出し方でも漏れは漏れ）。
 */
const FORBIDDEN_ON_SUBCONTRACTOR_PAGE = [
  DEMO_CUSTOMER_NAME,
  ...DEMO_QUOTES.map((quote) => quote.displayed),
  ...DEMO_QUOTES.map((quote) => String(quote.unitPrice)),
  "掛率",
  "売価",
  "原価",
];

/** 書類画面（スパイク）でシートに入れる数量。書類側の「数量：12 式」と対になる。 */
const SHEET_QUANTITY = "12";
/** 書類画面の固定データの単位（app/projects/spike-document/page.tsx の BASE_DATA）。 */
/** スパイクの書類にある唯一の明細名（apps/web/app/projects/spike-document/page.tsx）。 */
const SHEET_LINE_NAME = "キッチン工事";
const SHEET_UNIT = "式";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * ブラウザ側の例外・コンソールエラーを集める（C11）。最後にまとめて空であることを
 * 確かめる（起きていないはずの不具合を見逃さないため。個別の出力はしない）。
 * 収集先の配列を共有すれば、別コンテキストのページぶんも1回の assert で見られる。
 */
function collectBrowserErrors(page: Page, sink: string[]): void {
  page.on("pageerror", (error) => sink.push(`[pageerror] ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      sink.push(`[console.error] ${message.text()}`);
    }
  });
}

/**
 * ログインする。e2e/full-flow.spec.ts にも同じ手順があるが、あちらは旧経路の検査として
 * そのまま残す約束なので、共通化のためにあちらへ手を入れることはしない。
 */
async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(DEMO_USER_EMAIL!);
  await page.getByLabel("パスワード").fill(DEMO_USER_PASSWORD!);
  await page.getByRole("button", { name: "ログインする" }).click();
  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
}

/** 案件一覧から seed のデモ案件を開き、その案件IDを返す。 */
async function openDemoProject(page: Page): Promise<string> {
  await page.goto("/projects");
  await page
    .getByRole("link")
    .filter({ hasText: DEMO_CUSTOMER_NAME })
    .click();
  // 遷移前の "/projects" は /\/projects\/[^/]+$/ にマッチしないので、
  // full-flow.spec.ts が踏んだ「遷移を待たずに解決する」罠は起きない。
  await page.waitForURL((url) => /^\/projects\/[^/]+$/.test(url.pathname));
  const id = page.url().match(/\/projects\/([^/]+)$/)?.[1];
  if (!id) throw new Error(`案件詳細のURLから id を取れない: ${page.url()}`);
  return id;
}

/**
 * 社ごとの依頼トークンをDBから取る。元請の画面にトークンは出ないため、ここだけは
 * 画面ではなくDBを見る（seed の標準出力を解析するより、対象を名指しできる）。
 */
async function findRequestToken(
  projectId: string,
  companyName: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("quote_group_requests")
    .select(
      "token, subcontractors!inner ( company_name ), quote_request_groups!inner ( project_id )",
    )
    .eq("quote_request_groups.project_id", projectId)
    .eq("subcontractors.company_name", companyName);
  if (error) throw new Error(`依頼トークンの取得に失敗: ${error.message}`);

  const token = (data as { token: string }[] | null)?.[0]?.token;
  if (!token) {
    throw new Error(
      `${companyName} への依頼が見つからない（案件 ${projectId}）。seed が入っているか確認する。`,
    );
  }
  return token;
}

/**
 * 比較表の中の、明細1件ぶんの区画。
 * section 要素はアクセシブル名が無いと role を持たない（region にならない）ため、
 * ここだけ要素名で絞る。中の操作はすべて role/label で行う。
 */
function comparisonSection(page: Page, lineName: string) {
  return page.locator("section").filter({ hasText: lineName });
}

test("比較表に3社の単価が並び、明細ごとの採用は1社に置き換わる（C8/C9）", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  collectBrowserErrors(page, browserErrors);

  await login(page);
  const projectId = await openDemoProject(page);

  await page.goto(`/projects/${projectId}/comparison`);
  await expect(page.getByRole("heading", { name: "見積の比較" })).toBeVisible();

  // 3社ぶんの単価が同じ明細の下に並ぶ（比較表の中身そのもの）。
  const section = comparisonSection(page, DEMO_LINE_NAME);
  for (const quote of DEMO_QUOTES) {
    const row = section
      .getByRole("listitem")
      .filter({ hasText: quote.companyName });
    await expect(row).toContainText(`${quote.displayed}円`);
  }

  // 1社を採用すると「採用中」に変わる。
  const first = DEMO_QUOTES[0];
  await section
    .getByRole("listitem")
    .filter({ hasText: first.companyName })
    .getByRole("button", { name: "採用する" })
    .click();
  await expect(section.getByText(`採用中: ${first.companyName}`)).toBeVisible();

  // 別の社を採用し直すと置き換わる（2社が同時に採用中にならない＝C9の排他）。
  const second = DEMO_QUOTES[1];
  await section
    .getByRole("listitem")
    .filter({ hasText: second.companyName })
    .getByRole("button", { name: "採用する" })
    .click();
  await expect(section.getByText(`採用中: ${second.companyName}`)).toBeVisible();
  await expect(section.getByText(`採用中: ${first.companyName}`)).toHaveCount(0);
  // 採用を解除できるのは採用中の1社だけ。2社ぶん出ていたら排他が壊れている。
  await expect(
    section.getByRole("button", { name: "採用をやめる" }),
  ).toHaveCount(1);

  // 採用は「追加」ではないので、見積の明細行は増えない（C8）。
  // 「工事項目」ラベルは明細1行につき1つだけ（components/EstimateLineRow.tsx）。
  await page.goto(`/projects/${projectId}/estimate`);
  await expect(page.getByLabel("工事項目")).toHaveCount(DEMO_LINE_COUNT);
  await expect(page.getByLabel("工事項目").first()).toHaveValue(DEMO_LINE_NAME);

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

test("下請の回答画面に施主名と金額が出ず、施工場所は出ている（C2/C4）", async ({
  page,
  browser,
}) => {
  const browserErrors: string[] = [];
  collectBrowserErrors(page, browserErrors);

  await login(page);
  const projectId = await openDemoProject(page);
  const token = await findRequestToken(projectId, DEMO_QUOTES[0].companyName);

  // 下請はログインしない相手。元請のセッションを持たない別コンテキストで開く。
  const subcontractorContext = await browser.newContext();
  try {
    const subcontractorPage = await subcontractorContext.newPage();
    collectBrowserErrors(subcontractorPage, browserErrors);
    await subcontractorPage.goto(`/q/${token}`);

    // 新モデル（依頼グループ）の回答画面が出ていること。旧モデルの画面は見出しが違う。
    await expect(
      subcontractorPage.getByRole("heading", { name: "御見積のご依頼" }),
    ).toBeVisible();

    // 法定②施工場所は出す義務がある（C4）。
    await expect(subcontractorPage.getByText("施工場所")).toBeVisible();
    // 完全一致で探す。seed の工事名称は「<現場住所> リフォーム工事」なので、
    // 部分一致だと工事名称の欄にも当たって2要素になる。
    await expect(
      subcontractorPage.getByText(DEMO_SITE_ADDRESS, { exact: true }),
    ).toBeVisible();

    // 見えている文字だけでなく、返ってきたHTML全体を見る（C2）。
    // 画面に描いていなくても、サーバから送っている時点で漏れている。
    const html = await subcontractorPage.content();
    for (const forbidden of FORBIDDEN_ON_SUBCONTRACTOR_PAGE) {
      expect(
        html,
        `下請に返す画面に「${forbidden}」が含まれている`,
      ).not.toContain(forbidden);
    }
  } finally {
    await subcontractorContext.close();
  }

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});

// @mobile: このテストだけモバイル幅でも流す（playwright.config.ts の mobile
// プロジェクトが grep で拾う）。縮小した書類の上で行ブロックを押す経路は、
// 実機に近い幅でしか意味を持たない。
// ここで見るのは「モバイル幅で操作が成立するか」に絞る。iOS Safari 固有の挙動
// （入力欄が16px未満のときの自動ズーム等）はエミュレータでは再現できないので、
// 実機確認（docs/plan-rebuild.md B-1 の S3）が引き受ける。
test("書類の行を押すとシートで数量を入れられ、閉じると書類に反映される @mobile", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  collectBrowserErrors(page, browserErrors);

  // /projects 配下なのでログインが要る（proxy.ts の PROTECTED_PREFIXES）。
  await login(page);
  await page.goto("/projects/spike-document");

  // 書類が出ている（テンプレートの表題と、法定①②の欄）。
  await expect(
    page.getByRole("heading", { name: "御見積依頼書" }),
  ).toBeVisible();
  await expect(page.getByText("工事名称")).toBeVisible();
  await expect(page.getByText("数量未入力")).toBeVisible();

  // 書類の行ブロックを押す。
  // ここで getByRole("button") を使わない。**書類はボタンではない**（ARIA は
  // button の子孫を presentational として扱うため、role を付けると書類の見出しや
  // 表の意味が支援技術から消える）。指で押せることだけを持たせているので、
  // 書類の中の文字を掴んで押す。この時点でシートはまだ開いていないので、
  // 「キッチン工事」は書類側にしか無い。
  await page.getByText(SHEET_LINE_NAME).first().click();

  // シートは等倍で開く。数量を入れて閉じる。
  const quantity = page.getByLabel(`数量（${SHEET_UNIT}）`);
  await expect(quantity).toBeVisible();
  await quantity.fill(SHEET_QUANTITY);
  await page.getByRole("button", { name: "閉じる" }).click();

  // 閉じたあと、書類側に入れた数量が出ている（S4に相当）。
  await expect(quantity).toBeHidden();
  await expect(
    page.getByText(`数量：${SHEET_QUANTITY} ${SHEET_UNIT}`),
  ).toBeVisible();
  await expect(page.getByText("数量未入力")).toHaveCount(0);

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});
