"use server";

import { redirect } from "next/navigation";

import { createProject } from "../../../lib/db/projects";

export async function createProjectAction(formData: FormData): Promise<void> {
  const customerName = String(formData.get("customerName") ?? "").trim();
  const siteAddress = String(formData.get("siteAddress") ?? "").trim();

  if (!customerName || !siteAddress) {
    redirect("/projects/new?failed=1");
  }

  const project = await createProject({ customerName, siteAddress });
  redirect(`/projects/${project.id}`);
}
