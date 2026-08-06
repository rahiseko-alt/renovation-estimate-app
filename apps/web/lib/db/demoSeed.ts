// デモ用の一式（案件・明細・法定項目・下請3社・返信済みの回答3件）を作る。
//
// **下請の返信を待つデモは成立しない。** 商談の場で「では下請が返信するまでお待ち
// ください」とは言えないので、**返信済みのデータを最初から用意する**。
//
// 登場する会社名・人名・住所・メールアドレスはすべて架空のダミー
// （AGENTS.md 公開前提2：実在する第三者を特定できる情報を書かない）。
//
// 入口はこの関数1つ。アプリの「デモを始める」（app/demo/actions.ts）と、
// ログイン済み利用者に入れる CLI（scripts/seed-demo.ts）の両方がここを通る
// （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。

import { randomUUID } from "node:crypto";

import { getSupabaseClient } from "./client";

const CUSTOMER_NAME = "見本 太郎";
const SITE_ADDRESS = "東京都新宿区西新宿0-0-0 サンプルマンション101";

/** 同じ内容に作り直すための目印。同じ owner_id で2回実行しても増えない。 */
export const DEMO_WORK_NAME = `${SITE_ADDRESS} リフォーム工事`;

/** 明細。単価は下請が埋めるので0で置く（元請は金額を知らないのが正しい前提）。 */
const LINE_SOURCE = [
  { name: "キッチン工事", unit: "式", quantity: 1 },
  { name: "浴室工事", unit: "式", quantity: 1 },
  { name: "内装工事", unit: "㎡", quantity: 42 },
  { name: "解体・廃棄物処理費", unit: "式", quantity: 1 },
];

/** 法定④⑤⑥⑧の9スロット。会社設定の定型文が入っている想定の初期値。 */
const LEGAL_SLOTS: ReadonlyArray<readonly [string, string]> = [
  ["responsibility_scope", "本書に記載の工事範囲一式とする。"],
  ["subcontract_schedule", "着工日は別途協議のうえ決定する。"],
  ["overall_schedule", "全体工期は着工日から30日間を予定する。"],
  ["quote_conditions", "本書記載の条件によるものとする。"],
  ["trade_boundary", "電気・給排水設備工事との取合いは別途協議とする。"],
  ["special_parts", "特殊な施工部分はない。"],
  ["material_cost_burden", "材料費は元請の負担とする。"],
  ["safety_measures_burden", "労働災害防止対策の費用は元請の負担とする。"],
  ["waste_disposal_burden", "建設副産物の運搬及び処理は元請の負担とする。"],
];

/** 施工条件・範囲リストの12区分。デモでは全部に印を付けた状態にする。 */
const SITE_CONDITIONS: ReadonlyArray<readonly [string, string]> = [
  ["materials", "include"],
  ["assembly_processing", "include"],
  ["transport", "include"],
  ["scaffolding", "exclude"],
  ["marking_out", "include"],
  ["curing", "include"],
  ["cleanup", "include"],
  ["equipment", "include"],
  ["drawings_documents", "include"],
  ["samples", "exclude"],
  ["inspection_confirmation", "include"],
  ["safety", "include"],
];

/** 会社設定（請負者情報）。見積書PDFの請負者ボックスに出る。 */
const COMPANY_PROFILE = {
  contractor_name: "サンプル建設株式会社",
  representative_name: "見本 一郎",
  address: "東京都千代田区丸の内0-0-0 サンプルビル5階",
};

/** 3社ぶんの回答。同じ明細でも社によって値が違うのが比較表の見どころ。 */
const COMPANIES = [
  {
    companyName: "サンプル内装工業",
    email: "sample-naiso@example.com",
    prices: [820_000, 640_000, 3_200, 85_000],
    breakdown: {
      material_cost: 1_900_000,
      labor_cost: 1_200_000,
      legal_welfare_cost: 168_000,
      safety_health_cost: 42_000,
      retirement_mutual_aid_cost: 12_000,
      work_days: 22,
      material_supplied_note: "",
    },
  },
  {
    companyName: "テスト住宅設備",
    email: "test-setsubi@example.com",
    prices: [760_000, 710_000, 3_500, 92_000],
    breakdown: {
      material_cost: 2_050_000,
      labor_cost: 1_050_000,
      legal_welfare_cost: 147_000,
      safety_health_cost: 38_000,
      retirement_mutual_aid_cost: 11_000,
      work_days: 25,
      material_supplied_note: "石膏ボードは元請支給とする。",
    },
  },
  {
    companyName: "ダミー工務店",
    email: "dummy-koumuten@example.com",
    prices: [880_000, 600_000, 2_980, 78_000],
    breakdown: {
      material_cost: 1_780_000,
      labor_cost: 1_320_000,
      legal_welfare_cost: 184_000,
      // 未入力のまま返してくる社（努力義務なので空でも回答は成立する）。
      safety_health_cost: null,
      retirement_mutual_aid_cost: null,
      work_days: 20,
      material_supplied_note: "",
    },
  },
];

/** エラーを握りつぶさない。半分だけ入った状態を「成功」と見せない。 */
function must<T>(result: { data: T; error: unknown }, what: string): T {
  if (result.error) {
    const message =
      result.error instanceof Error
        ? result.error.message
        : String((result.error as { message?: string })?.message ?? result.error);
    throw new Error(`${what} に失敗: ${message}`);
  }
  return result.data;
}

async function removeExistingDemoData(ownerId: string): Promise<void> {
  const db = getSupabaseClient();
  const existing = must(
    await db
      .from("projects")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("work_name", DEMO_WORK_NAME),
    "既存のデモ案件の確認",
  );
  for (const row of existing as Array<{ id: string }>) {
    // 依頼・回答・採用はすべて on delete cascade で一緒に消える。
    must(await db.from("projects").delete().eq("id", row.id), "既存のデモ案件の削除");
  }
  // 下請台帳は案件に紐づかないので、メールアドレスで消す。
  must(
    await db
      .from("subcontractors")
      .delete()
      .eq("owner_id", ownerId)
      .in(
        "email",
        COMPANIES.map((company) => company.email),
      ),
    "既存のデモ下請の削除",
  );
}

/**
 * デモ一式を作り、案件IDを返す。同じ owner_id で何度呼んでも同じ内容に作り直す。
 * 進捗の文言は返さない（呼び出し側の画面・CLI がそれぞれの言い方で出す）。
 */
export async function seedDemoData(ownerId: string): Promise<string> {
  const db = getSupabaseClient();
  await removeExistingDemoData(ownerId);

  const lines = LINE_SOURCE.map((line) => ({
    id: randomUUID(),
    kind: "item",
    name: line.name,
    spec: "",
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: 0,
    taxCategory: "standard",
  }));

  // 会社設定は1事業者1件（owner_id が主キー）。デモでは請負者ボックスを埋めたいので入れる。
  must(
    await db
      .from("company_profiles")
      .upsert({ owner_id: ownerId, ...COMPANY_PROFILE })
      .select("owner_id")
      .single(),
    "会社設定の作成",
  );

  const project = must(
    await db
      .from("projects")
      .insert({
        owner_id: ownerId,
        customer_name: CUSTOMER_NAME,
        site_address: SITE_ADDRESS,
        work_name: DEMO_WORK_NAME,
      })
      .select("id")
      .single(),
    "案件の作成",
  ) as { id: string };

  must(
    await db
      .from("estimates")
      .insert({ project_id: project.id, lines, overhead_rate_percent: 15 })
      .select("id")
      .single(),
    "見積の作成",
  );

  must(
    await db.from("legal_item_slots").insert(
      LEGAL_SLOTS.map(([slotKey, value]) => ({
        project_id: project.id,
        owner_id: ownerId,
        slot_key: slotKey,
        status: "filled",
        value,
      })),
    ),
    "法定項目スロットの作成",
  );

  must(
    await db.from("site_condition_checks").insert(
      SITE_CONDITIONS.map(([category, mark]) => ({
        project_id: project.id,
        owner_id: ownerId,
        category,
        mark,
      })),
    ),
    "施工条件・範囲リストの作成",
  );

  const group = must(
    await db
      .from("quote_request_groups")
      .insert({
        project_id: project.id,
        owner_id: ownerId,
        presented_at: new Date().toISOString(),
      })
      .select("id, presented_at")
      .single(),
    "依頼グループの作成",
  ) as { id: string; presented_at: string };

  // 500万円未満なので見積期間は1日以上（建設業法施行令第6条。lib/legalPeriod.ts と同じ）。
  const responseDueAt = new Date(
    new Date(group.presented_at).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  const lineIds = lines.map((line) => line.id);

  for (const company of COMPANIES) {
    const subcontractor = must(
      await db
        .from("subcontractors")
        .insert({
          owner_id: ownerId,
          company_name: company.companyName,
          email: company.email,
        })
        .select("id")
        .single(),
      "下請台帳の作成",
    ) as { id: string };

    const request = must(
      await db
        .from("quote_group_requests")
        .insert({
          group_id: group.id,
          owner_id: ownerId,
          subcontractor_id: subcontractor.id,
          planned_price_band: "under_500man",
          response_due_at: responseDueAt,
          line_item_ids: lineIds,
          status: "responded",
          responded_at: new Date().toISOString(),
        })
        .select("id")
        .single(),
      "社ごとの依頼の作成",
    ) as { id: string };

    const response = must(
      await db
        .from("quote_group_responses")
        .insert({
          quote_group_request_id: request.id,
          ...company.breakdown,
        })
        .select("id")
        .single(),
      "回答の作成",
    ) as { id: string };

    must(
      await db.from("quote_group_response_lines").insert(
        lines.map((line, index) => {
          const costUnitPrice = company.prices[index];
          // 明細を足して単価を足し忘れると、0円の回答が黙って入る。
          // 比較表では「最安」に見えてしまうので、そこで気づけない。
          if (costUnitPrice === undefined) {
            throw new Error(
              `${company.companyName} の単価の数が明細の数と合っていません`,
            );
          }
          return {
            response_id: response.id,
            line_item_id: line.id,
            quantity: line.quantity,
            cost_unit_price: costUnitPrice,
          };
        }),
      ),
      "回答明細の作成",
    );
  }

  return project.id;
}

/** デモに登場する下請の社数。画面の案内文が数字を持たないようにここから取る。 */
export const DEMO_SUBCONTRACTOR_COUNT = COMPANIES.length;
