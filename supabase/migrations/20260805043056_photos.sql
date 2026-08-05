-- フェーズ2（写真）：案件に紐づく写真のメタデータと保存先。
-- 20260805022403_init.sql と同じ規約（owner_id はメールアドレス文字列、
-- RLS は有効化してポリシーは作らない、service_role へ明示 grant）に合わせる。
--
-- 写真は「箇所（PHOTO_AREAS）」単位で管理する。個々の明細行（estimates.lines の
-- jsonb 配列要素）には永続IDが無いため、特定の明細行への直接リンクは持たない
-- （lib/content.ts の PHOTO_AREAS 定義コメント参照。将来、明細行に永続IDを
-- 持たせる設計変更をするならそのときに photos.line_id を追加する）。

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id text not null,
  area text not null,
  -- Supabase Storage 上のオブジェクトキー（バケット "photos" 内のパス）。
  -- DB 行を消してもストレージのオブジェクトは自動では消えないため、
  -- 削除は lib/db/photos.ts 側で「DB行削除→ストレージ削除」の順に行う
  -- （ストレージ削除が後段で失敗しても、参照の無いオブジェクトが残るだけで
  -- 利用者には見えない。逆順だと、DB行削除が失敗したときに「参照先の無い
  -- storage_path を持つ行」が残り、一覧画面で壊れた画像として見えてしまう）。
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index photos_project_id_idx on public.photos (project_id);
create index photos_owner_id_idx on public.photos (owner_id);

alter table public.photos enable row level security;

grant select, insert, update, delete on public.photos to service_role;

-- 写真本体の保存先バケット。非公開（public: false）にする。
-- サーバーは service_role で Storage を操作するため storage.objects の RLS は
-- 素通りする。lib/db/ と同じ構図（アプリコード側の所有者チェックが唯一の境界）
-- なので、anon/authenticated 向けの Storage ポリシーは作らない
-- （バケットを非公開にしておかないと、ポリシー不在時に匿名の直接アクセスを
-- 許してしまう既定動作のプロジェクトがあるため、明示的に false を指定する）。
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
