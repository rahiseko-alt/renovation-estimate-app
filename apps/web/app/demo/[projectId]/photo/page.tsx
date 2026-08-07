import { notFound } from "next/navigation";

import { DemoBanner } from "../../../../components/DemoBanner";
import {
  DemoPhotoStep,
  type PhotoLine,
} from "../../../../components/DemoPhotoStep";
import { DemoRestartButton } from "../../../../components/DemoRestartButton";
import type { PhotoWithUrl } from "../../../projects/[id]/photos-actions";
import { getCurrentUser } from "../../../../lib/auth/server";
import { isDemoOwner } from "../../../../lib/auth/demoOwner";
import {
  photoAreaForLineName,
  PHOTO_SIGNED_URL_EXPIRES_SECONDS,
} from "../../../../lib/content";
import { DEMO_PHOTO_TEXT } from "../../../../lib/demoText";
import { getOrCreateEstimate } from "../../../../lib/db/estimates";
import { listPhotosForProject } from "../../../../lib/db/photos";
import { createPhotoSignedUrl } from "../../../../lib/db/photoStorage";
import { getProjectForOwner } from "../../../../lib/db/projects";

/**
 * D3 写真を撮る（`docs/flows.md`「デモの画面の並び」）。
 *
 * `/demo` は proxy.ts の保護対象に入れていない（保護対象はログインを要求する範囲で、
 * デモは無ログインで始まるため）。かわりに、ここでデモの識別子であることと
 * 案件の所有者であることの両方を確かめる。実利用者がURLを直打ちしても開かない。
 *
 * 画面に渡すのは2つ。
 * - **枠として並べる工事**：見積の明細行そのもの。**枠を押すとその工事の撮影になる**
 *   （docs/flows.md の D3。箇所を選ばせる形は 2026-08-07 にやめた）。
 *   写真は押した枠の `lineId` に結びつき、そのまま書類の枠に入る。
 *   `area` は `photos` の必須の列を埋めるためだけの値で、明細名から決める。
 * - **既に撮ってある写真**：D4 から「修正」で戻ったときに、枚数と見え方を引き継ぐため。
 *
 * ここはデモの着地点でもあるので、**直列に待つ往復を増やさない**
 * （`docs/failures.md` 2026-08-06 / 2026-08-07。往復1回が0.45〜0.85秒になる）。
 * 撮り始めは写真0枚で、そのとき署名付きURLの発行は1回も走らない。
 */
export default async function DemoPhotoPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const ownerId = await getCurrentUser();
  if (!ownerId || !isDemoOwner(ownerId)) notFound();

  const project = await getProjectForOwner(projectId, ownerId);
  if (!project) notFound();

  const [estimate, photos] = await Promise.all([
    getOrCreateEstimate(project.id),
    listPhotosForProject(project.id, ownerId),
  ]);

  // 枠にするのは工事の行だけ（値引き行は撮る対象ではない）。並びは見積のまま。
  const lines: PhotoLine[] = estimate.lines
    .filter((line) => line.kind === "item")
    .map((line) => ({
      id: line.id,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      area: photoAreaForLineName(line.name),
    }));

  const initialPhotos: PhotoWithUrl[] = await Promise.all(
    photos.map(async (photo) => ({
      ...photo,
      url: await createPhotoSignedUrl(
        photo.storagePath,
        PHOTO_SIGNED_URL_EXPIRES_SECONDS,
      ),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <DemoBanner />
      <h1 className="mt-4 text-2xl font-bold">{DEMO_PHOTO_TEXT.heading}</h1>
      <p className="mt-2 text-gray-700">{DEMO_PHOTO_TEXT.description}</p>

      <DemoPhotoStep
        projectId={projectId}
        // D3 の次は D4（確認画面）。docs/flows.md「デモの画面の並び」が正で、
        // この行き先を変えるときは表のほうを先に直す。
        nextHref={`/projects/${projectId}/document`}
        lines={lines}
        initialPhotos={initialPhotos}
      />

      {/* D2〜D10 に1つずつ置く「最初からやり直す」（この画面はデモ専用なので常に出す）。 */}
      <DemoRestartButton />
    </main>
  );
}
