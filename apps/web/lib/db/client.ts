// Supabase への接続。サーバー専用（service_role キーはクライアントに出してはいけない）。
// lib/db/ 配下のファイルだけがここを import する。画面・API から直接使わない
// （AGENTS.md「結合を増やさない」2：同じ処理を呼ぶ入口は1つにする）。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/**
 * Supabase クライアントを返す。未設定なら例外を投げる。
 * 開発用の既定値を埋め込むと、そのまま本番に出たときに接続先を誤認したまま動いてしまう
 * （lib/auth/session.ts の requireSecret と同じ理由であえて既定値を持たせていない）。
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。apps/web/.env.example を参照してください。",
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return client;
}
