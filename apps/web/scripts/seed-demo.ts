// ログイン済みの利用者に、デモ一式（返信済みの下請3社ぶんを含む）を入れる。
//
// 中身は lib/db/demoSeed.ts が持つ。ここは環境変数を受け取って呼ぶだけにする
// （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする。
//  アプリの「デモを触ってみる」も同じ関数を通る）。
//
// 実行: DEMO_USER_EMAIL=<ログインする利用者のメール> bash scripts/seed-demo.sh
// （接続情報の受け渡しは scripts/seed-demo.sh が行う）

import { seedDemoData } from "../lib/db/demoSeed";

// このパッケージは CommonJS 扱い（package.json に type: module が無い）ので、
// トップレベル await は使えない。関数に包んで呼ぶ。
async function main(): Promise<void> {
  const ownerId = process.env.DEMO_USER_EMAIL;
  if (!ownerId) {
    throw new Error(
      "DEMO_USER_EMAIL が未設定です。ログインする利用者と同じ値にしてください。",
    );
  }

  const projectId = await seedDemoData(ownerId);

  // トークンは /q の唯一の資格情報なので出力しない（端末履歴・ログに残る）。
  console.log(`デモ案件を作成しました: /projects/${projectId}`);
  console.log(`比較表: /projects/${projectId}/comparison`);
}

main().catch((error: unknown) => {
  // 握りつぶすと「入ったつもり」で E2E が走る。終了コードで落とす。
  console.error(error);
  process.exit(1);
});
