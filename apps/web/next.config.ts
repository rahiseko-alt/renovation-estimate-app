import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server Action へのリクエスト本文の既定上限は1MB。写真アップロード
  // （uploadPhotoAction）は圧縮後でも最大1.5MB（lib/photo/compress.ts の
  // MAX_OUTPUT_MB）になりうる上、multipart/form-data のオーバーヘッドも乗るため、
  // 既定のままだと圧縮後のファイルが Server Action に届く前に弾かれる。
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },

  // 見積書PDFが埋め込むフォント（lib/pdf/assets/）は fs.readFileSync で読むだけで
  // import しないため、デフォルトのファイルトレースでは Vercel のデプロイに
  // 含まれない。全ルートを対象に明示的に含める（生成は app/projects/[id]/pdf-actions.ts
  // の Server Action から呼ぶ。対象をこの1エントリだけに絞ると、パスパターンの
  // 表記を間違えたときに気付きにくいため、全ルート対象にしている）。
  outputFileTracingIncludes: {
    "/**": ["./lib/pdf/assets/**"],
  },

  // 最小セキュリティヘッダ。本番は Vercel が HTTPS を終端するので、
  // ここで HSTS を含む最小ヘッダを全ルートに付与する。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
