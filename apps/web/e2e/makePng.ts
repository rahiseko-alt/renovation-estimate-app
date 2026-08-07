// 検査に渡す画像を**その場で組み立てる**（PNGの最小の書き出し）。
//
// D3（写真を撮る）の枠を押すと開くのはカメラで、実ブラウザの検査でもカメラは扱えない。
// 踏めるのは「枠を押すと撮影の入口（ファイル選択）が開く」ところと「渡した画像が
// その枠に入る」ところで、後者にはブラウザが復号できる**本物のPNG**が要る。
//
// **リポジトリに画像ファイルを置かない**（検査のためだけの資材を増やさない）。
// ここはデモの検査とは別に直したくなる塊なので、spec から分けて置く
// （AGENTS.md「結合を増やさない」：行数で割らず、単独で直したくなる塊で分ける）。

import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG のチャンク1つ（長さ・種別・中身・CRC）。 */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 単色の PNG（size × size・8bit・トゥルーカラー）を組み立てて返す。 */
export function makePng(size = 64): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // カラータイプ（トゥルーカラー）
  const stride = 1 + size * 3; // 行頭の1バイトはフィルタ種別（0＝なし）
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const p = y * stride + 1 + x * 3;
      raw[p] = 200;
      raw[p + 1] = 120;
      raw[p + 2] = 60;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
