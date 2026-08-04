// 案件のデータアクセス。画面はここだけを通す（直接クエリを書かない）。
// 今は lib/db/memory.ts の仮実装。Supabase に差し替えるときはこのファイルの中身だけを直す。

import { newId, nowIso } from "./memory";
import type { NewProjectInput, Project } from "./types";

const projects = new Map<string, Project>();

export async function listProjects(): Promise<Project[]> {
  return [...projects.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export async function getProject(id: string): Promise<Project | null> {
  return projects.get(id) ?? null;
}

export async function createProject(input: NewProjectInput): Promise<Project> {
  const project: Project = {
    id: newId(),
    customerName: input.customerName,
    siteAddress: input.siteAddress,
    createdAt: nowIso(),
  };
  projects.set(project.id, project);
  return project;
}
