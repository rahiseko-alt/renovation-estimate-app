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
import imageCompression from "browser-image-compression";

const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_MB = 1.5;
const MAX_DIMENSION = 1600;

export class InvalidPhotoTypeError extends Error {}
export class PhotoTooLargeError extends Error {}

export async function compressPhotoForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new InvalidPhotoTypeError(`画像ファイルではありません: ${file.type || "(不明)"}`);
  }
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new PhotoTooLargeError(`元ファイルが大きすぎます: ${file.size} bytes`);
  }

  return imageCompression(file, {
    maxSizeMB: MAX_OUTPUT_MB,
    maxWidthOrHeight: MAX_DIMENSION,
    useWebWorker: true,
  });
}
