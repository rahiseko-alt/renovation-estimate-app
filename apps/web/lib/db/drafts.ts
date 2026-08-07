// 下書き（＝まだ下請けに出していない案件）の読み取り。画面はここだけを通す
// （直接クエリを書かない。lib/db/ 全体と同じ役割分担）。
//
// **下書き用のテーブルも列も作らない。** 「出したかどうか」は依頼グループ
// （quote_request_groups）が1件でもあるかで既に決まっているので、その事実を
// ここで数えるだけで足りる。docs/flows.md「デモの画面の並び」D8 の
// 「保存は、あとで続きをやるために取っておくだけ」がそのまま成立する。
//
// **下書きの定義はこのファイルだけが持つ**（AGENTS.md「結合を増やさない」1）。
// 定義を変えるときに触るのはここ1つで、画面は呼び出し方だけを知っていればよい。

import { getSupabaseClient } from "./client";
import { listProjectsForOwner } from "./projects";
import type { Project } from "./types";
import { isUuid } from "./uuid";

/**
 * 渡した案件のうち、**下請けに出したもの**のIDを返す。
 * 案件の件数によらず往復1回で済ませる（1件ずつ問い合わせると案件数だけ待つ）。
 *
 * 数えるのは「依頼グループがある」ではなく **「依頼が1件以上あるグループがある」**。
 * グループを作った直後に依頼の作成が落ちると、**1社にも届いていないのに
 * グループだけが残る**。それを「出した」と数えると、押し直しても送信済みの
 * 画面へ進むだけで、下請には永久に届かない。`quote_group_requests` との
 * 内部結合（`!inner`）が、依頼を持たないグループをここで落とす。
 */
async function selectSentProjectIds(
  projectIds: readonly string[],
  ownerId: string,
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();

  const { data, error } = await getSupabaseClient()
    .from("quote_request_groups")
    .select("project_id, quote_group_requests!inner(id)")
    .eq("owner_id", ownerId)
    .in("project_id", [...projectIds]);
  if (error) throw error;
  // data は null になりうる（エラー以外でも返る）。そのまま .map すると落ちるので
  // 「1件も出していない」と同じ扱いにする。
  return new Set(
    ((data ?? []) as { project_id: string }[]).map((row) => row.project_id),
  );
}

/**
 * その案件を既に下請けに出したか（依頼グループがあるか）。
 * 呼び出し側で案件の所有者確認（getProjectForOwner）を済ませた上で使う。
 */
export async function hasQuoteRequestGroup(
  projectId: string,
  ownerId: string,
): Promise<boolean> {
  if (!isUuid(projectId)) return false;
  const sent = await selectSentProjectIds([projectId], ownerId);
  return sent.has(projectId);
}

/** まだ下請けに出していない案件だけを、案件一覧と同じ並び（新しい順）で返す。 */
export async function listDraftProjectsForOwner(
  ownerId: string,
): Promise<Project[]> {
  const projects = await listProjectsForOwner(ownerId);
  const sent = await selectSentProjectIds(
    projects.map((project) => project.id),
    ownerId,
  );
  return projects.filter((project) => !sent.has(project.id));
}
