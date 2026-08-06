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

import { DEMO_OWNER_PREFIX } from "../auth/demoOwner";
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
import { getSupabaseClient } from "./client";
import { tryDeletePhotoObject } from "./photoStorage";

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

/**
 * この利用者のデモ案件と、デモが作った下請3社を消す。
 * 同じ内容に作り直すための前処理なので、会社設定は消さない（upsert で上書きする）。
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

/**
 * この利用者のデモ案件があればそのIDを返す。無ければ null。
 *
 * 同じ訪問者が「デモを触ってみる」を連打したときに、そのたびに作り直さないために使う。
 * 作り直しても件数は増えないが、1回あたり十数回の書き込みが走る。
 */
export async function findDemoProject(ownerId: string): Promise<string | null> {
  const rows = must(
    await getSupabaseClient()
      .from("projects")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("work_name", DEMO_WORK_NAME)
      .limit(1),
    "デモ案件の確認",
  ) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/**
 * 案件を消したあとに1件も案件が残らない所有者だけを返す。
 *
 * 下請台帳と会社設定は案件に紐づかず `owner_id` 単位で消すしかない。
 * **デモ利用者も画面から2件目の案件を作れる**ので、所有者の案件が1件でも残るなら
 * これらを消してはいけない（残った案件から下請と請負者名が消える）。
 * まだ期限が来ていない案件を持つ所有者も、同じ理由で対象外になる。
 */
async function ownersWithNothingLeft(
  removable: ReadonlySet<string>,
  expired: ReadonlyArray<{ id: string; owner_id: string }>,
): Promise<string[]> {
  const candidates = [
    ...new Set(
      expired.filter((row) => removable.has(row.id)).map((row) => row.owner_id),
    ),
  ];
  if (candidates.length === 0) return [];

  // 消す前に数える。消したあとでは「残るはずだった案件」が分からない。
  const owned = must(
    await getSupabaseClient()
      .from("projects")
      .select("id, owner_id")
      .in("owner_id", candidates),
    "デモ所有者の案件の確認",
  ) as Array<{ id: string; owner_id: string }>;

  const stillHasProject = new Set(
    owned.filter((row) => !removable.has(row.id)).map((row) => row.owner_id),
  );
  return candidates.filter((ownerId) => !stillHasProject.has(ownerId));
}

/**
 * 期限を過ぎたデモ利用者のデータを消す。消した案件の数を返す。
 *
 * **デモは無ログインで、訪問ごとに `demo:<uuid>` が1つ増える。**
 * Cookie の有効期間を短くしても、DBの行は残り続ける。放置すると溜まるので、
 * 誰かがデモを始めるたびに、ついでに古いものを掃除する
 * （定時実行の仕組みをこのアプリは持っていない。入口を1つに保つ方を優先する）。
 *
 * 実利用者のデータには触れない。`demo:` で始まる owner_id だけを対象にする。
 */
export async function purgeExpiredDemoData(
  expiresBefore: Date,
): Promise<number> {
  const db = getSupabaseClient();
  const cutoff = expiresBefore.toISOString();

  const expired = must(
    await db
      .from("projects")
      .select("id, owner_id")
      .like("owner_id", `${DEMO_OWNER_PREFIX}%`)
      .lt("created_at", cutoff),
    "期限切れのデモ案件の確認",
  ) as Array<{ id: string; owner_id: string }>;

  if (expired.length === 0) return 0;

  const candidateIds = expired.map((row) => row.id);

  // 写真の実体は Storage にあり、案件を消しても道連れにはならない。先に消す。
  //
  // **ストレージの削除に失敗した案件は、この回では消さない。** 行を先に消すと
  // storage_path が失われ、残ったオブジェクトを二度と回収できなくなる。
  // 行を残しておけば、次に誰かがデモを始めたときにもう一度やり直せる。
  const photos = must(
    await db
      .from("photos")
      .select("project_id, storage_path")
      .in("project_id", candidateIds),
    "期限切れのデモ写真の確認",
  ) as Array<{ project_id: string; storage_path: string }>;

  const failedProjectIds = new Set<string>();
  for (const photo of photos) {
    if (!(await tryDeletePhotoObject(photo.storage_path))) {
      failedProjectIds.add(photo.project_id);
    }
  }

  const projectIds = candidateIds.filter((id) => !failedProjectIds.has(id));
  if (projectIds.length === 0) return 0;

  const removable = new Set(projectIds);
  const ownerIds = await ownersWithNothingLeft(removable, expired);

  // 見積・法定項目・依頼・回答・写真の行は on delete cascade で一緒に消える。
  must(
    await db.from("projects").delete().in("id", projectIds),
    "期限切れのデモ案件の削除",
  );
  // 下請台帳と会社設定は案件に紐づかないので、owner_id で消す。
  must(
    await db.from("subcontractors").delete().in("owner_id", ownerIds),
    "期限切れのデモ下請の削除",
  );
  must(
    await db.from("company_profiles").delete().in("owner_id", ownerIds),
    "期限切れのデモ会社設定の削除",
  );

  return projectIds.length;
}
