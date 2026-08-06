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

import {
  COMPANIES,
  COMPANY_PROFILE,
  CUSTOMER_NAME,
  DEMO_WORK_NAME,
  LEGAL_SLOTS,
  LINE_SOURCE,
  SITE_ADDRESS,
  SITE_CONDITIONS,
} from "../demoFixture";
import { computeResponseDueAt } from "../legalPeriod";
import { getSupabaseClient } from "./client";
import { must } from "./mustResult";

/** まとめて入れた行を突き合わせるときに、取り違えを黙って通さないための確認。 */
function requireValue<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`${what} を取れませんでした`);
  }
  return value;
}

/**
 * この利用者のデモ案件と、デモが作った下請3社を消す。
 * 同じ内容に作り直すための前処理なので、会社設定は消さない（upsert で上書きする）。
 *
 * 初めての利用者（デモの1タップ目）では案件が無いので、往復は2回で済む。
 */
async function removeExistingDemoData(ownerId: string): Promise<void> {
  const db = getSupabaseClient();

  const existing = must(
    await db
      .from("projects")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("work_name", DEMO_WORK_NAME),
    "既存のデモ案件の確認",
  ) as Array<{ id: string }>;

  // **順番を入れ替えられない。** 依頼（quote_group_requests）が下請を参照しているので、
  // 案件を消して依頼が cascade で消えるより先に下請を消すと外部キーに弾かれる。
  if (existing.length > 0) {
    must(
      await db.from("projects").delete().in("id", existing.map((row) => row.id)),
      "既存のデモ案件の削除",
    );
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
 *
 * **DBへの往復回数がそのまま1タップ目の待ち時間になる。**
 * 1件ずつ順に入れると実行時20往復になり、本番（Vercel → Supabase）で5〜10秒かかって
 * 関数のタイムアウト境界に張り付いた。**依存の無いものは同時に、同じ表への複数行は
 * 1回の insert にまとめる。** 下の「波」の数が往復の回数で、増やさないこと。
 */
export async function seedDemoData(ownerId: string): Promise<string> {
  const db = getSupabaseClient();

  // 波1：後始末。
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
  const lineIds = lines.map((line) => line.id);

  // 波2：互いに依存しない3つ。会社設定は1事業者1件（owner_id が主キー）。
  const [, project, subcontractors] = await Promise.all([
    db
      .from("company_profiles")
      .upsert({ owner_id: ownerId, ...COMPANY_PROFILE })
      .then((result) => must(result, "会社設定の作成")),
    db
      .from("projects")
      .insert({
        owner_id: ownerId,
        customer_name: CUSTOMER_NAME,
        site_address: SITE_ADDRESS,
        work_name: DEMO_WORK_NAME,
      })
      .select("id")
      .single()
      .then((result) => must(result, "案件の作成") as { id: string }),
    db
      .from("subcontractors")
      .insert(
        COMPANIES.map((company) => ({
          owner_id: ownerId,
          company_name: company.companyName,
          email: company.email,
        })),
      )
      .select("id, email")
      .then(
        (result) =>
          must(result, "下請台帳の作成") as Array<{ id: string; email: string }>,
      ),
  ]);

  const presentedAt = new Date().toISOString();

  // 波3：案件ができてから入るもの。互いには依存しない。
  const [, , , group] = await Promise.all([
    db
      .from("estimates")
      .insert({ project_id: project.id, lines, overhead_rate_percent: 15 })
      .then((result) => must(result, "見積の作成")),
    db
      .from("legal_item_slots")
      .insert(
        LEGAL_SLOTS.map(([slotKey, value]) => ({
          project_id: project.id,
          owner_id: ownerId,
          slot_key: slotKey,
          status: "filled",
          value,
        })),
      )
      .then((result) => must(result, "法定項目スロットの作成")),
    db
      .from("site_condition_checks")
      .insert(
        SITE_CONDITIONS.map(([category, mark]) => ({
          project_id: project.id,
          owner_id: ownerId,
          category,
          mark,
        })),
      )
      .then((result) => must(result, "施工条件・範囲リストの作成")),
    db
      .from("quote_request_groups")
      .insert({ project_id: project.id, owner_id: ownerId, presented_at: presentedAt })
      .select("id")
      .single()
      .then((result) => must(result, "依頼グループの作成") as { id: string }),
  ]);

  // 見積期間は建設業法施行令第6条。日数の定義は lib/legalPeriod.ts が持つ。
  // ここで日数を書き直すと、法令の解釈を2箇所に持つことになる。
  const responseDueAt = computeResponseDueAt(
    new Date(presentedAt),
    "under_500man",
  ).toISOString();

  const subcontractorIdByEmail = new Map(
    subcontractors.map((row) => [row.email, row.id]),
  );
  const respondedAt = new Date().toISOString();

  // 波4：3社ぶんの依頼をまとめて1回で入れる。
  const requests = must(
    await db
      .from("quote_group_requests")
      .insert(
        COMPANIES.map((company) => ({
          group_id: group.id,
          owner_id: ownerId,
          subcontractor_id: requireValue(
            subcontractorIdByEmail.get(company.email),
            `${company.companyName} の下請ID`,
          ),
          planned_price_band: "under_500man",
          response_due_at: responseDueAt,
          line_item_ids: lineIds,
          status: "responded",
          responded_at: respondedAt,
        })),
      )
      .select("id, subcontractor_id"),
    "社ごとの依頼の作成",
  ) as Array<{ id: string; subcontractor_id: string }>;

  const requestIdBySubcontractorId = new Map(
    requests.map((row) => [row.subcontractor_id, row.id]),
  );

  // 波5：回答をまとめて1回で。
  const responses = must(
    await db
      .from("quote_group_responses")
      .insert(
        COMPANIES.map((company) => ({
          quote_group_request_id: requireValue(
            requestIdBySubcontractorId.get(
              requireValue(
                subcontractorIdByEmail.get(company.email),
                `${company.companyName} の下請ID`,
              ),
            ),
            `${company.companyName} の依頼ID`,
          ),
          ...company.breakdown,
        })),
      )
      .select("id, quote_group_request_id"),
    "回答の作成",
  ) as Array<{ id: string; quote_group_request_id: string }>;

  const responseIdByRequestId = new Map(
    responses.map((row) => [row.quote_group_request_id, row.id]),
  );

  // 波6：回答明細（3社 × 明細数）をまとめて1回で。
  must(
    await db.from("quote_group_response_lines").insert(
      COMPANIES.flatMap((company) => {
        const requestId = requireValue(
          requestIdBySubcontractorId.get(
            requireValue(
              subcontractorIdByEmail.get(company.email),
              `${company.companyName} の下請ID`,
            ),
          ),
          `${company.companyName} の依頼ID`,
        );
        const responseId = requireValue(
          responseIdByRequestId.get(requestId),
          `${company.companyName} の回答ID`,
        );
        return lines.map((line, index) => {
          const costUnitPrice = company.prices[index];
          // 明細を足して単価を足し忘れると、0円の回答が黙って入る。
          // 比較表では「最安」に見えてしまうので、そこで気づけない。
          if (costUnitPrice === undefined) {
            throw new Error(
              `${company.companyName} の単価の数が明細の数と合っていません`,
            );
          }
          return {
            response_id: responseId,
            line_item_id: line.id,
            quantity: line.quantity,
            cost_unit_price: costUnitPrice,
          };
        });
      }),
    ),
    "回答明細の作成",
  );

  return project.id;
}
