import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DownloadPdfButton } from "../../../components/DownloadPdfButton";
import { PhotosSection } from "../../../components/PhotosSection";
import { getCurrentUser } from "../../../lib/auth/server";
import { createPhotoSignedUrl } from "../../../lib/db/photoStorage";
import { listPhotosForProject } from "../../../lib/db/photos";
import { getProjectForOwner } from "../../../lib/db/projects";
import type { Photo } from "../../../lib/db/types";
import { PROJECT_DETAIL_TEXT, PROJECTS_TEXT } from "../../../lib/content";

// 一覧表示のたびに都度発行し直す短命の署名付きURL。photos-actions.ts の
// アップロード直後の発行と同じ値にしている（画面内で扱う署名付きURLの寿命を統一する）。
const SIGNED_URL_EXPIRES_SECONDS = 300;

async function withSignedUrl(photo: Photo) {
  const url = await createPhotoSignedUrl(photo.storagePath, SIGNED_URL_EXPIRES_SECONDS);
  return { ...photo, url };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const project = await getProjectForOwner(id, user);
  if (!project) notFound();

  const photos = await listPhotosForProject(project.id, user);
  const photosWithUrl = await Promise.all(photos.map(withSignedUrl));

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold">{project.customerName}</h1>
      <p className="mt-2 text-gray-700">{project.siteAddress}</p>

      <Link
        href={`/projects/${project.id}/estimate`}
        className="tap mt-8 flex items-center justify-center rounded bg-blue-800 px-6 py-4 text-lg font-bold text-white"
      >
        {PROJECT_DETAIL_TEXT.estimateLink}
      </Link>

      <DownloadPdfButton projectId={project.id} />

      <Link
        href="/projects"
        className="tap mt-4 flex items-center justify-center rounded border-2 border-gray-500 px-5 py-3 font-bold"
      >
        {PROJECTS_TEXT.back}
      </Link>

      <PhotosSection projectId={project.id} initialPhotos={photosWithUrl} />
    </main>
  );
}
