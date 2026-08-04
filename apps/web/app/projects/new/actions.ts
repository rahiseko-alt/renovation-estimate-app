"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../lib/auth/server";
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
  redirect(`/projects/${project.id}`);
}
