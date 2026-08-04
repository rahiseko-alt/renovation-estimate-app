// 案件のデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// 今は lib/db/memory.ts の仮実装。Supabase に差し替えるときはこのファイルの中身だけを直す。
//
// 一覧・取得はすべて ownerId で絞る。呼び出し側が推測した他人の案件 ID を渡しても
// 中身が返らないようにするため、絞り込まない取得関数はこのファイルに置かない
// （他人の案件IDを知っているだけで読み書きできる状態を防ぐ境界を、ここ1箇所に固定する）。

import { newId, nowIso } from "./memory";
import type { NewProjectInput, Project } from "./types";

const projects = new Map<string, Project>();

export async function listProjectsForOwner(ownerId: string): Promise<Project[]> {
  return [...projects.values()]
    .filter((project) => project.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 案件が存在し、かつ ownerId の持ち物であるときだけ返す。それ以外は null。 */
export async function getProjectForOwner(
  id: string,
  ownerId: string,
): Promise<Project | null> {
  const project = projects.get(id);
  return project && project.ownerId === ownerId ? project : null;
}

export async function createProject(
  input: NewProjectInput,
  ownerId: string,
): Promise<Project> {
  const project: Project = {
    id: newId(),
    ownerId,
    customerName: input.customerName,
    siteAddress: input.siteAddress,
    createdAt: nowIso(),
  };
  projects.set(project.id, project);
  return project;
}
