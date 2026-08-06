"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../lib/auth/server";
import { applyCompanyDefaultsToProject } from "../../../lib/db/projectDefaults";
import { createProject } from "../../../lib/db/projects";

export async function createProjectAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const customerName = String(formData.get("customerName") ?? "").trim();
  const siteAddress = String(formData.get("siteAddress") ?? "").trim();

  if (!customerName || !siteAddress) {
    redirect("/projects/new?failed=1");
  }

  const project = await createProject({ customerName, siteAddress }, user);
  // 会社設定の定型文を、この案件の初期値として複製する。案件を作る入口はここ1つなので、
  // 「新しい案件には定型文が入っている」を守るのもここ1箇所で足りる。
  await applyCompanyDefaultsToProject(project.id, user);
  redirect(`/projects/${project.id}`);
}
