import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DownloadPdfButton } from "../../../components/DownloadPdfButton";
import { PhotosSection } from "../../../components/PhotosSection";
import { getCurrentUser } from "../../../lib/auth/server";
import { createPhotoSignedUrl } from "../../../lib/db/photoStorage";
import { listPhotosForProject } from "../../../lib/db/photos";
import { getProjectForOwner } from "../../../lib/db/projects";
import type { Photo } from "../../../lib/db/types";
import {
  PHOTO_SIGNED_URL_EXPIRES_SECONDS,
  PROJECT_DETAIL_TEXT,
  PROJECTS_TEXT,
} from "../../../lib/content";

async function withSignedUrl(photo: Photo) {
  const url = await createPhotoSignedUrl(
    photo.storagePath,
    PHOTO_SIGNED_URL_EXPIRES_SECONDS,
  );
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
