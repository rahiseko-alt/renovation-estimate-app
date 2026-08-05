// 写真アップロード前の、ブラウザ内での圧縮・向き補正。
// アップロードのAPI（Server Action）はここを通した後のファイルだけを受け取る想定
// （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。
//
// ブラウザの Canvas/Image API に依存するため、この関数は Client Component からのみ
// 呼ぶ（サーバー側で呼ぶと window/document が無くて例外になる）。
//
// EXIF の向きの扱い：canvas で再エンコードすると EXIF は失われるため、圧縮の「前」に
// 向きを画素へ焼き込む必要がある（順序を間違えると縦写真が寝る）。自前で実装せず
// browser-image-compression に委ねる。exifOrientation オプションは明示指定しない
// —— このライブラリの compress() は内部で
// `options.exifOrientation ?? (await getExifOrientation(file))` を使い、かつ
// `isAutoOrientationInBrowser()` でブラウザ自身が既に自動回転済みかどうかを検知して
// 二重回転を避ける（v2.0.2 のソース `lib/image-compression.js` で確認済み）。
// ここで exifOrientation を手動で渡すと、この自動判定を上書きしてしまい、
// ブラウザ側の自動回転と重なって二重に回転する組み合わせが起こりうる。
//
// useWebWorker: true にすると、このライブラリは既定で自分自身を
// https://cdn.jsdelivr.net から Web Worker 内に読み込む（README の libURL 参照）。
// 現場（電波の弱い場所）での撮影を前提にした PWA でこれに頼ると、圧縮のたびに
// 外部CDNへの接続が要る（失敗時はメインスレッド圧縮へ自動で落ちるため撮影自体は
// 止まらないが、毎回無駄な通信とコンソールエラーが出る）。同じファイルを
// public/vendor/ に自前で置き、libURL で同一オリジンを指す。
import imageCompression from "browser-image-compression";

import { PHOTO_ALLOWED_TYPES, PHOTO_MAX_UPLOAD_MB } from "../content";

const MAX_ORIGINAL_BYTES = PHOTO_MAX_UPLOAD_MB * 1024 * 1024;
const MAX_OUTPUT_MB = 1.5;
const MAX_DIMENSION = 1600;

export class InvalidPhotoTypeError extends Error {}
export class PhotoTooLargeError extends Error {}

export async function compressPhotoForUpload(file: File): Promise<File> {
  if (!PHOTO_ALLOWED_TYPES.includes(file.type as (typeof PHOTO_ALLOWED_TYPES)[number])) {
    throw new InvalidPhotoTypeError(`対応していない画像形式です: ${file.type || "(不明)"}`);
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new PhotoTooLargeError(`元ファイルが大きすぎます: ${file.size} bytes`);
  }

  return imageCompression(file, {
    maxSizeMB: MAX_OUTPUT_MB,
    maxWidthOrHeight: MAX_DIMENSION,
    useWebWorker: true,
    libURL: "/vendor/browser-image-compression.js",
  });
}
