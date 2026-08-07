import { notFound } from "next/navigation";

import { DemoBanner } from "../../../../components/DemoBanner";
import { DemoRestartButton } from "../../../../components/DemoRestartButton";
import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import { getCurrentUser } from "../../../../lib/auth/server";
import { NEW_PROJECT_TEXT, PROJECT_STEP_TEXT } from "../../../../lib/content";
import { getProjectForOwner } from "../../../../lib/db/projects";
import { saveDemoProjectAction } from "./actions";

/**
 * D2「案件をつくる」（docs/flows.md「デモの画面の並び」）。デモの1タップ目の着地点。
 *
 * **見本が入った状態で開く**（利用者の回答 ③B。商談で打つ手間を減らす）。
 * 見本の値は seed が作った案件の現在値をそのまま出す。この画面が別に定数を持つと、
 * デモの中身（`lib/demoFixture.ts`）を直したときに片方だけ古くなる。
 *
 * `/demo` は proxy.ts の保護対象に入れていない（保護対象はログインを要求する範囲で、
 * デモは無ログインで始まるため）。かわりに、ここでデモの識別子であることと
 * 案件の所有者であることの両方を確かめる。実利用者がURLを直打ちしても開かない。
 */
export default async function DemoProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ failed?: string }>;
}) {
  const { projectId } = await params;
  const { failed } = await searchParams;

  const ownerId = await getCurrentUser();
  if (!ownerId || !isDemoOwner(ownerId)) notFound();

  const project = await getProjectForOwner(projectId, ownerId);
  if (!project) notFound();

  const errorId = "demo-project-error";
  const save = saveDemoProjectAction.bind(null, projectId);

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <DemoBanner />
      <h1 className="mt-4 text-2xl font-bold">{PROJECT_STEP_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{PROJECT_STEP_TEXT.description}</p>

      {failed ? (
        <p
          id={errorId}
          role="alert"
          className="mt-4 rounded border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
        >
          {PROJECT_STEP_TEXT.failed}
        </p>
      ) : null}

      {/* 1カラム・ラベルは入力欄の上（/projects/new と同じ組み方）。 */}
      <form action={save} className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="customerName" className="font-bold">
            {NEW_PROJECT_TEXT.customerNameLabel}
          </label>
          <input
            id="customerName"
            name="customerName"
            type="text"
            required
            defaultValue={project.customerName}
            aria-describedby={failed ? errorId : undefined}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="siteAddress" className="font-bold">
            {NEW_PROJECT_TEXT.siteAddressLabel}
          </label>
          <input
            id="siteAddress"
            name="siteAddress"
            type="text"
            required
            defaultValue={project.siteAddress}
            aria-describedby={failed ? errorId : undefined}
            className="rounded border-2 border-gray-500 px-4 py-3"
          />
        </div>

        {/* ボタンはこの1つだけ（docs/flows.md の D2。表に無いものは作らない）。 */}
        <button
          type="submit"
          className="tap flex items-center justify-center rounded bg-blue-800 px-6 py-5 text-lg font-bold text-white"
        >
          {PROJECT_STEP_TEXT.next}
        </button>
      </form>

      {/* D2〜D10 に1つずつ置く「最初からやり直す」（この画面はデモ専用なので常に出す）。 */}
      <DemoRestartButton />
    </main>
  );
}
