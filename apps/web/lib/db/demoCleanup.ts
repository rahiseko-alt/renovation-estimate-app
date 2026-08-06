// デモの後始末（既にデモ中かの確認と、期限切れの掃除）。
//
// 投入（lib/db/demoSeed.ts）から分けて置く。**変える理由が別**で、
// あちらは「デモに何を見せるか」、こちらは「溜めないための運用」に属する。

import { DEMO_OWNER_PREFIX } from "../auth/demoOwner";
import { DEMO_WORK_NAME } from "../demoFixture";
import { getSupabaseClient } from "./client";
import { must } from "./mustResult";
import { tryDeletePhotoObjects } from "./photoStorage";

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
 * 1回の掃除で扱う案件の上限。
 *
 * **上限を置かないと、溜まったときに掃除そのものが通らなくなる。**
 * ここで取ったIDは `.in(...)` に載ってURLになるので、件数が増えるとURLが長くなりすぎて
 * 弾かれる。しかも次の回も同じ大きさの一覧を作り直すので、二度と減らない。
 * 1回ぶんを区切っておけば、デモが始まるたびに少しずつ減る。
 */
const PURGE_BATCH_SIZE = 100;

/**
 * 案件を1件も持たない `demo:` 所有者を探す（下請台帳・会社設定だけが残っている状態）。
 *
 * 掃除は「案件を消す → owner_id 単位の行を消す」の順で、トランザクションを張っていない。
 * 前半だけ成功して後半で落ちると、案件から辿れない行が残る。**それは案件を起点にする
 * 掃除では二度と拾えない**ので、こちらから直接探す。
 *
 * **投入中のデモを巻き込まないよう、期限を過ぎたものだけを見る。**
 * 投入は案件と下請を同時に入れるので、その一瞬だけ「案件の無い所有者」に見える。
 * 時刻で縛らないと、始めたばかりのデモの下請台帳を消してしまう。
 */
async function orphanedDemoOwners(cutoff: string): Promise<string[]> {
  const db = getSupabaseClient();

  const [fromSubcontractors, fromProfiles] = await Promise.all([
    db
      .from("subcontractors")
      .select("owner_id")
      .like("owner_id", `${DEMO_OWNER_PREFIX}%`)
      .lt("created_at", cutoff)
      .limit(PURGE_BATCH_SIZE)
      .then((r) => must(r, "取り残されたデモ下請の確認") as Array<{ owner_id: string }>),
    db
      .from("company_profiles")
      .select("owner_id")
      .like("owner_id", `${DEMO_OWNER_PREFIX}%`)
      .lt("updated_at", cutoff)
      .limit(PURGE_BATCH_SIZE)
      .then((r) => must(r, "取り残されたデモ会社設定の確認") as Array<{ owner_id: string }>),
  ]);

  // 2つの問い合わせをまとめると上限の2倍になる。**混ぜたあとで区切り直す。**
  // 区切らないと `.in(...)` のURLが長くなりすぎて、掃除そのものが通らなくなる。
  const candidates = [
    ...new Set(
      [...fromSubcontractors, ...fromProfiles].map((row) => row.owner_id),
    ),
  ].slice(0, PURGE_BATCH_SIZE);
  if (candidates.length === 0) return [];

  const owned = must(
    await db.from("projects").select("owner_id").in("owner_id", candidates),
    "取り残された所有者の案件の確認",
  ) as Array<{ owner_id: string }>;

  const hasProject = new Set(owned.map((row) => row.owner_id));
  return candidates.filter((ownerId) => !hasProject.has(ownerId));
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
      .lt("created_at", cutoff)
      .limit(PURGE_BATCH_SIZE),
    "期限切れのデモ案件の確認",
  ) as Array<{ id: string; owner_id: string }>;

  const candidateIds = expired.map((row) => row.id);

  // 写真の実体は Storage にあり、案件を消しても道連れにはならない。先に消す。
  //
  // **ストレージの削除に失敗した案件は、この回では消さない。** 行を先に消すと
  // storage_path が失われ、残ったオブジェクトを二度と回収できなくなる。
  // 行を残しておけば、次に誰かがデモを始めたときにもう一度やり直せる。
  const failedProjectIds = new Set<string>();
  if (candidateIds.length > 0) {
    const photos = must(
      await db
        .from("photos")
        .select("project_id, storage_path")
        .in("project_id", candidateIds),
      "期限切れのデモ写真の確認",
    ) as Array<{ project_id: string; storage_path: string }>;

    const pathsByProject = new Map<string, string[]>();
    for (const photo of photos) {
      const paths = pathsByProject.get(photo.project_id) ?? [];
      paths.push(photo.storage_path);
      pathsByProject.set(photo.project_id, paths);
    }
    for (const [projectId, paths] of pathsByProject) {
      if (!(await tryDeletePhotoObjects(paths))) {
        failedProjectIds.add(projectId);
      }
    }
  }

  const projectIds = candidateIds.filter((id) => !failedProjectIds.has(id));
  const removable = new Set(projectIds);

  // **消す案件が無くても、ここは通る。** 前回の掃除が案件を消したあとで落ちていると、
  // 下請と会社設定だけが取り残される。その所有者はもう案件を持たないので、
  // 案件から辿る経路では二度と拾えない。毎回こちらからも探す。
  // 2つの出どころを混ぜると、それぞれの上限の合計まで膨らむ。ここでも区切る。
  // あふれたぶんは、次にデモが始まったときに続きを消す。
  const ownerIds = [
    ...new Set([
      ...(await ownersWithNothingLeft(removable, expired)),
      ...(await orphanedDemoOwners(cutoff)),
    ]),
  ].slice(0, PURGE_BATCH_SIZE);

  if (projectIds.length > 0) {
    // 見積・法定項目・依頼・回答・写真の行は on delete cascade で一緒に消える。
    must(
      await db.from("projects").delete().in("id", projectIds),
      "期限切れのデモ案件の削除",
    );
  }

  // 下請台帳と会社設定は案件に紐づかないので、owner_id で消す。
  // 空で投げると、何にも当たらない削除を2回打つことになる。
  if (ownerIds.length > 0) {
    must(
      await db.from("subcontractors").delete().in("owner_id", ownerIds),
      "期限切れのデモ下請の削除",
    );
    must(
      await db.from("company_profiles").delete().in("owner_id", ownerIds),
      "期限切れのデモ会社設定の削除",
    );
  }

  return projectIds.length;
}
