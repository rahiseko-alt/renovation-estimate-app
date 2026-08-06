// デモの後始末（既にデモ中かの確認と、期限切れの掃除）。
//
// 投入（lib/db/demoSeed.ts）から分けて置く。**変える理由が別**で、
// あちらは「デモに何を見せるか」、こちらは「溜めないための運用」に属する。

import { DEMO_OWNER_PREFIX } from "../auth/demoOwner";
import { DEMO_WORK_NAME } from "../demoFixture";
import { getSupabaseClient } from "./client";
import { tryDeletePhotoObject } from "./photoStorage";

/** エラーを握りつぶさない。半分だけ消えた状態を「成功」と見せない。 */
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
