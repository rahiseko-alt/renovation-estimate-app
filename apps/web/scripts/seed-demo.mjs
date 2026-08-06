// デモ用の初期データを入れる（docs/plan-rebuild.md PR-C の5）。
//
// **下請の返信を待つデモは成立しない。** 商談の場で「では下請が返信するまでお待ち
// ください」とは言えないので、**返信済みのデータを最初から用意する**。
//
// 登場する会社名・人名・住所・メールアドレスはすべて架空のダミー
// （AGENTS.md 公開前提2：実在する第三者を特定できる情報を書かない）。
//
// 実行: DEMO_USER_EMAIL=<ログインする利用者のメール> bash scripts/seed-demo.sh
// （接続情報の受け渡しは scripts/seed-demo.sh が行う。直接 node で動かすときは
//   apps/web を作業ディレクトリにすること。@supabase/supabase-js が apps/web の依存で、
//   Node は import をファイルの位置から解決するため）
//
// owner_id はログインした利用者のメールアドレスなので、DEMO_USER_EMAIL から取る
// （固定のSQLに書けない。だから supabase の seed.sql ではなくこのスクリプトにしている）。
//
// 何度実行しても増えないよう、同じ工事名称の案件が既にあれば先に消してから作り直す。

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_ID = process.env.DEMO_USER_EMAIL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。supabase status -o env から取ってください。",
  );
}
if (!OWNER_ID) {
  throw new Error("DEMO_USER_EMAIL が未設定です。ログインする利用者と同じ値にしてください。");
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** エラーを握りつぶさない。seed が半分だけ入った状態を「成功」と見せない。 */
function must(result, what) {
  if (result.error) {
    throw new Error(`${what} に失敗: ${result.error.message}`);
  }
  return result.data;
}

const CUSTOMER_NAME = "見本 太郎";
const SITE_ADDRESS = "東京都新宿区西新宿0-0-0 サンプルマンション101";
const WORK_NAME = `${SITE_ADDRESS} リフォーム工事`;

/** 明細。単価は下請が埋めるので0で置く（元請は金額を知らないのが正しい前提）。 */
const LINES = [
  { name: "キッチン工事", unit: "式", quantity: 1 },
  { name: "浴室工事", unit: "式", quantity: 1 },
  { name: "内装工事", unit: "㎡", quantity: 42 },
  { name: "解体・廃棄物処理費", unit: "式", quantity: 1 },
].map((line) => ({
  id: randomUUID(),
  kind: "item",
  name: line.name,
  spec: "",
  quantity: line.quantity,
  unit: line.unit,
  unitPrice: 0,
  taxCategory: "standard",
}));

/** 法定④⑤⑥⑧の9スロット。会社設定の定型文が入っている想定の初期値。 */
const LEGAL_SLOTS = [
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
const SITE_CONDITIONS = [
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

async function removeExistingDemoProject() {
  const existing = must(
    await db
      .from("projects")
      .select("id")
      .eq("owner_id", OWNER_ID)
      .eq("work_name", WORK_NAME),
    "既存のデモ案件の確認",
  );
  for (const row of existing) {
    // 依頼・回答・採用はすべて on delete cascade で一緒に消える。
    must(await db.from("projects").delete().eq("id", row.id), "既存のデモ案件の削除");
  }
  // 下請台帳は案件に紐づかないので、メールアドレスで消す。
  must(
    await db
      .from("subcontractors")
      .delete()
      .eq("owner_id", OWNER_ID)
      .in("email", COMPANIES.map((company) => company.email)),
    "既存のデモ下請の削除",
  );
}

async function seed() {
  await removeExistingDemoProject();

  const project = must(
    await db
      .from("projects")
      .insert({
        owner_id: OWNER_ID,
        customer_name: CUSTOMER_NAME,
        site_address: SITE_ADDRESS,
        work_name: WORK_NAME,
      })
      .select("id")
      .single(),
    "案件の作成",
  );

  must(
    await db
      .from("estimates")
      .insert({ project_id: project.id, lines: LINES, overhead_rate_percent: 15 })
      .select("id")
      .single(),
    "見積の作成",
  );

  must(
    await db.from("legal_item_slots").insert(
      LEGAL_SLOTS.map(([slotKey, value]) => ({
        project_id: project.id,
        owner_id: OWNER_ID,
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
        owner_id: OWNER_ID,
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
        owner_id: OWNER_ID,
        presented_at: new Date().toISOString(),
      })
      .select("id, presented_at")
      .single(),
    "依頼グループの作成",
  );

  // 500万円未満なので見積期間は1日以上（建設業法施行令第6条。lib/legalPeriod.ts と同じ）。
  const responseDueAt = new Date(
    new Date(group.presented_at).getTime() + 24 * 60 * 60 * 1000,
  ).toISOString();

  const lineIds = LINES.map((line) => line.id);

  for (const company of COMPANIES) {
    const subcontractor = must(
      await db
        .from("subcontractors")
        .insert({
          owner_id: OWNER_ID,
          company_name: company.companyName,
          email: company.email,
        })
        .select("id")
        .single(),
      "下請台帳の作成",
    );

    const request = must(
      await db
        .from("quote_group_requests")
        .insert({
          group_id: group.id,
          owner_id: OWNER_ID,
          subcontractor_id: subcontractor.id,
          planned_price_band: "under_500man",
          response_due_at: responseDueAt,
          line_item_ids: lineIds,
          status: "responded",
          responded_at: new Date().toISOString(),
        })
        .select("id, token")
        .single(),
      "社ごとの依頼の作成",
    );

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
    );

    must(
      await db.from("quote_group_response_lines").insert(
        lineIds.map((lineItemId, index) => ({
          response_id: response.id,
          line_item_id: lineItemId,
          quantity: LINES[index].quantity,
          cost_unit_price: company.prices[index],
        })),
      ),
      "回答明細の作成",
    );

    // トークンは /q の唯一の資格情報なので出力しない（端末履歴・ログに残る）。
    console.log(`回答済みの依頼を作成: ${company.companyName}`);
  }

  console.log(`デモ案件を作成しました: ${WORK_NAME}`);
  console.log(`比較表: /projects/${project.id}/comparison`);
}

await seed();
