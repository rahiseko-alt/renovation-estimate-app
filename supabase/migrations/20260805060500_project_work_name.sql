-- 法定①工事名称は「案件情報から自動」（docs/design.md 7章）で埋める項目だが、
-- projects テーブルには施主名・現場住所しか無く、工事名称の元データが存在しなかった
-- （独立検証で判明。会話ログの「①わからん推奨で」に対する回答：列を足し、
-- 初期値を自動生成して画面上で直せるようにする）。
--
-- 新規作成される案件の初期値の自動生成（現場住所から「〇〇 リフォーム工事」を組み立てる。
-- 施主名からは組み立てない。施主名は下請に見せない項目のため、見せる項目である
-- 工事名称に紛れ込ませない）はアプリ側（lib/db/projects.ts、lib/content.ts の
-- buildDefaultWorkName）で行う。AGENTS.md「結合を増やさない」1により、この文言は
-- 通常アプリ側に一本化するが、この UPDATE は本マイグレーション適用時点で既に
-- 存在する行（work_name 列がまだ無く、既定値が入りようがなかった行）を一度だけ
-- 埋めるためのものであり、以後アプリコードと同期を取り続ける必要がない
-- （CodeRabbit のレビューで指摘：列を空文字のまま残すと、この直後に作る依頼グループの
-- 下請向け投影 quoteRequestGroups.ts が空の工事名称を返してしまう）。
-- buildDefaultWorkName と同じ組み立て方をここでも行う。

alter table public.projects
  add column work_name text not null default '';

update public.projects
set work_name = site_address || ' リフォーム工事'
where work_name = '';
