// テストを走らせる前に、テスト用の行だけを消す。
//
// ローカルの Supabase は実行をまたいでデータが残る（毎回作り直してはいない）。
// 案件と下請台帳には所有者ごとの登録件数の上限（lib/limits.ts）があるため、
// 前回までの行が残っていると、2回目以降の実行が「上限に達しています」で落ちる
// （全件を1回走らせるだけで owner-a@example.com には案件89件・下請51件が貯まる。
// 上限は100件なので2回目で越える）。落ちる原因は実装ではなく前回の残骸なので、
// テストを緩めるのではなく、始める前に残骸を消す。
//
// 消すのは owner_id が example.com のもの（RFC 2606 の予約ドメイン。テストの持ち主に
// しか使わない）に限る。デモデータ（owner_id が `demo:` で始まる）と本物の利用者の行は
// 触らない。件数の上限があるのはこの2つのテーブルだけなので、対象もこの2つに限る。

import { createClient } from "@supabase/supabase-js";

const TEST_OWNER_PATTERN = "%@example.com";
const TABLES = ["projects", "subcontractors"] as const;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * 手元・CI のローカル Supabase を指しているか。
 *
 * **これが無いと、`SUPABASE_URL` がたまたま本番を指していたときに本番の行を消す。**
 * 消す条件（`owner_id` が example.com）は本番に実在しにくいが、「実在しにくい」は
 * 消してよい理由にならない。接続先そのもので止める。
 */
function isLocalSupabase(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export default async function setup(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // 未設定なら何もしない。接続できないこと自体は、各テストが自分で報告する。
  if (!url || !serviceRoleKey) return;
  // ローカル以外を指していたら、消さずに止める（黙って素通りさせると、
  // 消えなかったのか消したのかが分からない）。
  if (!isLocalSupabase(url)) {
    throw new Error(
      "テストの前処理は、ローカルの Supabase に対してだけ実行します。SUPABASE_URL を確かめてください。",
    );
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (const table of TABLES) {
    const { error } = await client
      .from(table)
      .delete()
      .like("owner_id", TEST_OWNER_PATTERN);
    if (error) throw error;
  }
}
