-- 写真を、見積の明細行に結びつける（docs/flows.md 工程5「写真をはめ込んだ書類になる」）。
--
-- これが無いと、撮った写真は書類の枠に入らない。書類テンプレート
-- （lib/doc/schema.ts の DocData.photoUrlByLineId）は**明細行IDをキーに**写真を引くが、
-- photos が持っていたのは「箇所」（内装・外壁…という文字列）だけで、明細行の
-- 安定ID（PersistedEstimateLine.id）と突き合わせる列が無かった。
-- そのため実データの写真は書類にもPDFにも1枚も入らず、固定サンプルの画面
-- （/projects/spike-document）でしか写真の枠が埋まらなかった。
--
-- 元のテーブル（20260805043056_photos.sql）のコメントは「将来、明細行に永続IDを
-- 持たせる設計変更をするなら、そのときに photos.line_id を追加する」と書いていた。
-- 永続IDは 20260805060000_estimate_line_ids.sql で入ったので、ここで追加する。
--
-- **外部キーは張れない。** 明細行は estimates.lines（jsonb 配列）の要素であって
-- 行ではないため、参照先が存在しない（line_adoptions.line_item_id と同じ事情）。
-- 「その明細がこの案件のものか」はアプリ側（lib/db/photos.ts）で確かめる。
--
-- **null を許す。** 既存の写真は箇所しか持っておらず、後から明細行を決められない。
-- また「箇所は撮ったが、まだ明細行が無い」状態は実務で普通に起きる（先に撮ってから
-- 数量を入れる）。null は「まだどの行にも結びついていない写真」を意味する。
-- 書類の枠を埋めるのは line_id が入っている写真だけ。

alter table public.photos
  add column line_id uuid;

comment on column public.photos.line_id is
  '結びついている見積明細行（estimates.lines の要素が持つ安定ID）。null は未結び付け。';

-- 書類を描くときに「この案件の、この明細行の写真」を引く。
create index photos_project_id_line_id_idx
  on public.photos (project_id, line_id);
