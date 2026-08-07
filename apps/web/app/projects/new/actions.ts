"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../lib/auth/server";
import { FAILED_LIMIT, NEW_PROJECT_TEXT } from "../../../lib/content";
import { applyCompanyDefaultsToProject } from "../../../lib/db/projectDefaults";
import {
  createProject,
  deleteProjectForOwner,
} from "../../../lib/db/projects";

/** 件数の上限で断られた例外かどうか。文面は文言の置き場所が1つだけ持つ。 */
function isLimitError(error: unknown): boolean {
  return (
    error instanceof Error && error.message === NEW_PROJECT_TEXT.failedLimit
  );
}

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

  // 上限に達したときだけ、入力内容の不備（failed=1）と別の理由として画面に伝える。
  // それ以外の失敗はここで握りつぶさず、そのまま投げ直す。
  const project = await createProject(
    { customerName, siteAddress },
    user,
  ).catch((error: unknown) => {
    if (isLimitError(error)) {
      redirect(`/projects/new?failed=${FAILED_LIMIT}`);
    }
    throw error;
  });

  // 会社設定の定型文を、この案件の初期値として複製する。案件を作る入口はここ1つなので、
  // 「新しい案件には定型文が入っている」を守るのもここ1箇所で足りる。
  //
  // **失敗したら、作った案件を消してから投げ直す。** 案件の作成と定型文の複製は
  // 別々の書き込みで、1つのトランザクションに入っていない。途中で落ちたまま残すと、
  // 「定型文が入っていない案件」が、会社設定が空のときと見分けのつかない姿で残る。
  // そのうえ利用者が登録し直すと案件が2件になる。作った直後で中身がまだ無いので、
  // 消して作り直しに戻すほうが安全（写真・見積・依頼は on delete cascade で一緒に消える）。
  try {
    await applyCompanyDefaultsToProject(project.id, user);
  } catch (error) {
    // 後始末そのものが失敗しても、投げ直すのは元の失敗のほう（原因が分かるのはこちら）。
    await deleteProjectForOwner(project.id, user).catch(() => {});
    throw error;
  }

  redirect(`/projects/${project.id}`);
}
