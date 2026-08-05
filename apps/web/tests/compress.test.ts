import { describe, expect, it, vi } from "vitest";

// browser-image-compression は Canvas/Image など DOM API に依存し、
// vitest の実行環境（vitest.config.ts で environment: "node"）には無い。
// ここでは lib/photo/compress.ts が「圧縮を呼ぶ前に何を検証するか」だけを見たいので、
// ライブラリ本体はスタブに差し替える（本体のEXIF処理自体はライブラリ側の責務であり、
// このアプリのテストで担保する対象ではない。判断根拠は lib/photo/compress.ts のコメント参照）。
const compressCalls: Array<[File, unknown]> = [];
vi.mock("browser-image-compression", () => ({
  default: (file: File, options: unknown) => {
    compressCalls.push([file, options]);
    return Promise.resolve(file);
  },
}));

const { compressPhotoForUpload, InvalidPhotoTypeError, PhotoTooLargeError } =
  await import("../lib/photo/compress");

describe("compressPhotoForUpload", () => {
  it("画像ファイル以外は InvalidPhotoTypeError", async () => {
    const file = new File(["not an image"], "note.txt", { type: "text/plain" });
    await expect(compressPhotoForUpload(file)).rejects.toBeInstanceOf(
      InvalidPhotoTypeError,
    );
  });

  it("20MBを超えるファイルは PhotoTooLargeError", async () => {
    const bytes = new Uint8Array(20 * 1024 * 1024 + 1);
    const file = new File([bytes], "big.jpg", { type: "image/jpeg" });
    await expect(compressPhotoForUpload(file)).rejects.toBeInstanceOf(
      PhotoTooLargeError,
    );
  });

  it("妥当な画像ファイルは圧縮ライブラリに渡す", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", {
      type: "image/jpeg",
    });
    await compressPhotoForUpload(file);
    expect(compressCalls).toHaveLength(1);
    const [calledFile, options] = compressCalls[0]!;
    expect(calledFile).toBe(file);
    expect(options).toMatchObject({ maxSizeMB: 1.5, maxWidthOrHeight: 1600 });
    // libURL を自前ホストの同一オリジンに固定する。既定のまま（未指定）だと
    // ライブラリが Web Worker 内で外部CDN（cdn.jsdelivr.net）を読みに行き、
    // 現場の電波状況次第で失敗しうる（lib/photo/compress.ts のコメント参照）。
    expect(options).toMatchObject({
      libURL: "/vendor/browser-image-compression.js",
    });
  });
});
