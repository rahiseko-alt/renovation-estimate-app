-- 下請が書く「元請支給の材料」の付記に長さの上限を付ける。
--
-- この欄はログインしていない相手（下請）から届く自由文で、/q/[token] の
-- Server Action だけが入口になる。アプリ側（app/q/[token]/group-actions.ts の
-- MAX_NOTE_LENGTH）でも同じ値で止めているが、**クライアントもServer Actionも
-- 直接叩ける**ので、DB側にも同じ境界を置く
-- （app/projects/[id]/photos-actions.ts と同じ「両側で確かめる」原則）。
--
-- 2000文字は、支給材料の但し書きとして現実的な範囲に対する上限であって、
-- 業務上の意味を持つ数ではない。既定値（空文字）はそのまま通る。

alter table public.quote_group_responses
  add constraint quote_group_responses_note_length
  check (char_length(material_supplied_note) <= 2000);
