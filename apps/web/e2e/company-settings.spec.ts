// 会社設定に対するE2E。
//
// 検査するのは1点：**会社設定に書いた定型文が、そのあと作った案件の法定項目に
// 初めから入っているか。** これが動かないと、案件を作るたびに9スロットを
// ゼロから打つことになり、会社設定を置いた意味が無くなる。
//
// 「複製であって参照ではない」ことも同じ流れで確かめる。会社設定をあとから直したとき、
// 既に作った案件まで遡って変わってしまうと、下請へ送った書類と画面が食い違う。
//
// seed のデータは使わない（e2e/ledger-flow.spec.ts と同じ理由。最初から埋まっていたのか
// 画面で埋めたのかが区別できなくなる）。

import { expect, test, type Page } from "@playwright/test";

import {
  COMPANY_PROFILE_TEXT,
  LEGAL_ITEM_SLOT_LABELS,
  LEGAL_ITEMS_TEXT,
} from "../lib/content";

// scripts/e2e.sh がこの検査の中だけで使い捨てる値を用意する（本物の秘密情報ではない。
// AGENTS.md「秘密情報」対象外1）。無ければ検査そのものが無意味なので、先に落とす。
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL;
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD;
if (!DEMO_USER_EMAIL || !DEMO_USER_PASSWORD) {
  throw new Error(
    "DEMO_USER_EMAIL / DEMO_USER_PASSWORD が未設定。scripts/e2e.sh 経由で実行すること。",
  );
}

// 会社設定は1事業者につき1件しかなく、この検査は毎回それを上書きする。
// 実行ごとに違う値にして、前回の値がそのまま残っていても合格しないようにする。
const RUN_SUFFIX = `${Date.now().toString(36)}-${process.pid}`;
const CONTRACTOR_NAME = `設定テスト工務店-${RUN_SUFFIX}`;
const DEFAULT_SCOPE_VALUE = `内装仕上げ工事一式（${RUN_SUFFIX}）`;
const REVISED_SCOPE_VALUE = `あとから直した定型文（${RUN_SUFFIX}）`;

/** ブラウザ側の例外・コンソールエラーを集める。 */
function collectBrowserErrors(page: Page, sink: string[]): void {
  page.on("pageerror", (error) => sink.push(`[pageerror] ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      sink.push(`[console.error] ${message.text()}`);
    }
  });
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(DEMO_USER_EMAIL!);
  await page.getByLabel("パスワード").fill(DEMO_USER_PASSWORD!);
  await page.getByRole("button", { name: "ログインする" }).click();
  await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
}

/** 案件を新しく作り、その案件IDを返す。 */
async function createProject(page: Page, customerName: string): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel("施主名").fill(customerName);
  await page.getByLabel("現場住所").fill("東京都港区0-0-0");
  await page.getByRole("button", { name: "登録する" }).click();
  // 遷移前の "/projects/new" 自体もパターンにマッチするので除外する。
  await page.waitForURL(
    (url) =>
      /^\/projects\/[^/]+$/.test(url.pathname) &&
      url.pathname !== "/projects/new",
  );
  const id = page.url().match(/\/projects\/([^/]+)$/)?.[1];
  if (!id) throw new Error(`案件詳細のURLから id を取れない: ${page.url()}`);
  return id;
}

/** 責任施工範囲スロットの本文欄。fieldset の legend で絞り込む。 */
function scopeValueField(page: Page) {
  return page
    .getByRole("group", {
      name: LEGAL_ITEM_SLOT_LABELS.responsibility_scope,
      exact: true,
    })
    .getByLabel(LEGAL_ITEMS_TEXT.valueLabel);
}

async function saveCompanyDefault(page: Page, scopeValue: string): Promise<void> {
  await page.goto("/settings/company");
  await page
    .getByLabel(COMPANY_PROFILE_TEXT.contractorNameLabel)
    .fill(CONTRACTOR_NAME);
  await page
    .getByLabel(LEGAL_ITEM_SLOT_LABELS.responsibility_scope)
    .fill(scopeValue);
  await page.getByRole("button", { name: COMPANY_PROFILE_TEXT.save }).click();
  await expect(page.getByText(COMPANY_PROFILE_TEXT.saved)).toBeVisible();
}

test("会社設定の定型文が、あとで作った案件の法定項目に初めから入っている", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  collectBrowserErrors(page, browserErrors);

  await login(page);

  // --- 1. 会社設定に請負者名と定型文を書く -------------------------------
  await saveCompanyDefault(page, DEFAULT_SCOPE_VALUE);

  // 読み直しても残っている（画面の状態だけが変わったのではない）。
  await page.reload();
  await expect(
    page.getByLabel(COMPANY_PROFILE_TEXT.contractorNameLabel),
  ).toHaveValue(CONTRACTOR_NAME);

  // --- 2. そのあとで案件を作ると、法定項目が埋まっている -----------------
  const projectId = await createProject(page, "設定テスト施主");
  await page.goto(`/projects/${projectId}/legal`);

  await expect(
    page
      .getByRole("group", {
        name: LEGAL_ITEM_SLOT_LABELS.responsibility_scope,
        exact: true,
      })
      .getByRole("radio", { name: LEGAL_ITEMS_TEXT.statusLabels.filled }),
  ).toBeChecked();
  await expect(scopeValueField(page)).toHaveValue(DEFAULT_SCOPE_VALUE);

  // 定型文を置いていないスロットは未入力のまま（空文字で埋めない）。
  await expect(
    page
      .getByRole("group", {
        name: LEGAL_ITEM_SLOT_LABELS.subcontract_schedule,
        exact: true,
      })
      .getByRole("radio", { name: LEGAL_ITEMS_TEXT.statusLabels.unset }),
  ).toBeChecked();

  // --- 3. 会社設定を直しても、既にある案件は変わらない -------------------
  await saveCompanyDefault(page, REVISED_SCOPE_VALUE);
  await page.goto(`/projects/${projectId}/legal`);
  await expect(scopeValueField(page)).toHaveValue(DEFAULT_SCOPE_VALUE);

  // --- 4. 直したあとに作った案件には、新しい定型文が入る -----------------
  const laterProjectId = await createProject(page, "設定テスト施主2");
  await page.goto(`/projects/${laterProjectId}/legal`);
  await expect(scopeValueField(page)).toHaveValue(REVISED_SCOPE_VALUE);

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});
