// 下請台帳と法定項目・施工条件の入力画面に対するE2E。
//
// この2画面が無かった間、DB層も送信ゲートも比較表も動いていたのに、**画面だけでは
// 一周できなかった**（下請を登録する手段が無く、法定項目を埋める手段も無いので、
// 送信ゲートが永久に閉じたままだった）。ここで検査するのはその1点：
// **seed に頼らず、ログインしてから画面の操作だけで依頼を送れる状態まで到達できるか。**
//
// seed のデータは使わない（使うと「最初から埋まっていた」のか「画面で埋められた」のかが
// 区別できず、この検査の意味が無くなる）。案件はこのテストの中で新しく作る。

import { expect, test, type Page } from "@playwright/test";

import {
  LEGAL_ITEM_SLOT_LABELS,
  LEGAL_ITEMS_LINK_LABEL,
  LEGAL_ITEMS_TEXT,
  SEND_REQUEST_TEXT,
  SITE_CONDITION_LABELS,
  SUBCONTRACTORS_TEXT,
} from "../lib/content";
import {
  LEGAL_ITEM_SLOT_KEYS,
  SITE_CONDITION_CATEGORIES,
} from "../lib/db/types";

// scripts/e2e.sh がこの検査の中だけで使い捨てる値を用意する（本物の秘密情報ではない。
// AGENTS.md「秘密情報」対象外1）。無ければ検査そのものが無意味なので、先に落とす。
const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL;
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD;
if (!DEMO_USER_EMAIL || !DEMO_USER_PASSWORD) {
  throw new Error(
    "DEMO_USER_EMAIL / DEMO_USER_PASSWORD が未設定。scripts/e2e.sh 経由で実行すること。",
  );
}

/**
 * この検査が登録する下請。実在する会社・実在するメールアドレスは使わない。
 *
 * **実行ごとに違う名前にする。** `scripts/seed-demo.sh` は自分が作る3社しか消さないので、
 * 固定名だと前回の実行で残った行が台帳に居座る。すると「登録が失敗しても、古い行が
 * 見つかって検査が通る」ことになり、登録の動作を確かめたことにならない。
 */
const RUN_SUFFIX = `${Date.now().toString(36)}-${process.pid}`;
const NEW_SUBCONTRACTOR = {
  companyName: `台帳テスト建設-${RUN_SUFFIX}`,
  email: `ledger-test-${RUN_SUFFIX}@example.com`,
} as const;

/** 「記入する」を試す1スロットと、その本文。残りは「未定」で通す。 */
const FILLED_SLOT_KEY = "quote_conditions" as const;
const FILLED_SLOT_VALUE = "現場は日曜休み。搬入は午前中のみ。";

/** ブラウザ側の例外・コンソールエラーを集める（C11）。 */
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
async function createProject(page: Page): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel("施主名").fill("台帳テスト施主");
  await page.getByLabel("現場住所").fill("東京都港区0-0-0");
  await page.getByRole("button", { name: "登録する" }).click();
  // 遷移前の "/projects/new" 自体も /\/projects\/[^/]+$/ にマッチするので除外する
  // （除外しないと遷移を待たずに解決する。e2e/full-flow.spec.ts と同じ罠）。
  await page.waitForURL(
    (url) =>
      /^\/projects\/[^/]+$/.test(url.pathname) &&
      url.pathname !== "/projects/new",
  );
  const id = page.url().match(/\/projects\/([^/]+)$/)?.[1];
  if (!id) throw new Error(`案件詳細のURLから id を取れない: ${page.url()}`);
  return id;
}

/**
 * 法定項目の1スロットに状態を選ぶ。
 * fieldset は legend をアクセシブル名に持つ group なので、項目名で絞り込める。
 * **exact: true が要る**：施工条件の「材料」は法定項目の「材料費の負担」の部分文字列で、
 * 既定の部分一致だと2つの group に当たる。
 */
function slotGroup(page: Page, label: string) {
  return page.getByRole("group", { name: label, exact: true });
}

test("下請を登録し法定項目を埋めると、画面の操作だけで依頼を送れる（seedに頼らない）", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  collectBrowserErrors(page, browserErrors);

  await login(page);

  // --- 1. 下請台帳に登録する ---------------------------------------------
  await page.goto("/subcontractors");
  await expect(
    page.getByRole("heading", { name: SUBCONTRACTORS_TEXT.heading }),
  ).toBeVisible();
  await page
    .getByLabel(SUBCONTRACTORS_TEXT.companyNameLabel)
    .fill(NEW_SUBCONTRACTOR.companyName);
  await page
    .getByLabel(SUBCONTRACTORS_TEXT.emailLabel)
    .fill(NEW_SUBCONTRACTOR.email);
  await page
    .getByRole("button", { name: SUBCONTRACTORS_TEXT.submit })
    .click();
  // 再試行で同じ社が2件になりうるので first() で見る（登録できたことだけを見る）。
  await expect(
    page.getByText(NEW_SUBCONTRACTOR.companyName).first(),
  ).toBeVisible();

  // --- 2. 案件を新しく作る -----------------------------------------------
  const projectId = await createProject(page);

  // --- 3. この時点では、送信ゲートが閉じている ---------------------------
  await page.goto(`/projects/${projectId}/send`);
  await expect(page.getByText(SEND_REQUEST_TEXT.gateNgHeading)).toBeVisible();
  await expect(
    page.getByRole("button", { name: SEND_REQUEST_TEXT.send }),
  ).toBeDisabled();

  // 足りない項目の案内から、直しに行ける（行き止まりにしない）。
  await page.getByRole("link", { name: LEGAL_ITEMS_LINK_LABEL }).click();
  await page.waitForURL(`**/projects/${projectId}/legal`);

  // --- 4. 法定項目9スロットと施工条件12区分を埋める ----------------------
  // 個数（9・12）を書き写さず、唯一の正である配列から回す。
  for (const slotKey of LEGAL_ITEM_SLOT_KEYS) {
    const group = slotGroup(page, LEGAL_ITEM_SLOT_LABELS[slotKey]);
    if (slotKey === FILLED_SLOT_KEY) {
      await group
        .getByRole("radio", { name: LEGAL_ITEMS_TEXT.statusLabels.filled })
        .check();
      // 「記入する」を選んだときだけ本文欄が出る。
      await group
        .getByLabel(LEGAL_ITEMS_TEXT.valueLabel)
        .fill(FILLED_SLOT_VALUE);
    } else {
      await group
        .getByRole("radio", {
          name: LEGAL_ITEMS_TEXT.statusLabels.undetermined,
        })
        .check();
    }
  }
  for (const category of SITE_CONDITION_CATEGORIES) {
    await slotGroup(page, SITE_CONDITION_LABELS[category])
      .getByRole("radio", { name: LEGAL_ITEMS_TEXT.markLabels.include })
      .check();
  }

  await page.getByRole("button", { name: LEGAL_ITEMS_TEXT.save }).click();
  await expect(page.getByText(LEGAL_ITEMS_TEXT.saved)).toBeVisible();

  // 読み直しても選んだ内容が残っている（保存されたのが画面の状態だけではない）。
  await page.reload();
  await expect(
    slotGroup(page, LEGAL_ITEM_SLOT_LABELS[FILLED_SLOT_KEY]).getByLabel(
      LEGAL_ITEMS_TEXT.valueLabel,
    ),
  ).toHaveValue(FILLED_SLOT_VALUE);

  // --- 5. 送信ゲートが開き、そのまま送れる -------------------------------
  await page.goto(`/projects/${projectId}/send`);
  await expect(page.getByText(SEND_REQUEST_TEXT.gateOk)).toBeVisible();

  await page
    .getByRole("checkbox", { name: NEW_SUBCONTRACTOR.companyName })
    .first()
    .check();
  await page
    .getByRole("radio", {
      name: SEND_REQUEST_TEXT.priceBandLabels.under_500man,
    })
    .check();

  await page.getByRole("button", { name: SEND_REQUEST_TEXT.send }).click();
  await page.waitForURL(`**/projects/${projectId}/comparison`);
  await expect(
    page.getByRole("heading", { name: "見積の比較" }),
  ).toBeVisible();
  // 送り先として選んだ社が、比較表に列として並んでいる。
  await expect(
    page.getByText(NEW_SUBCONTRACTOR.companyName).first(),
  ).toBeVisible();

  expect(browserErrors, browserErrors.join("\n")).toEqual([]);
});
