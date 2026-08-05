// テスト用のスタブ。本物の "server-only" パッケージは、Next.js のビルド条件
// （"react-server"）が付いていない環境で import すると例外を投げる仕様のため、
// vitest（素の Node）でそのまま import すると lib/db/client.ts の import だけで
// テストスイート全体が落ちる。vitest.config.ts の alias でこのファイルに差し替える。
