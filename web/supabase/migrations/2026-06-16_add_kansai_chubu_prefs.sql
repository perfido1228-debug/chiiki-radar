-- 関西・中部の府県を stores.pref の CHECK 制約に追加（愛知・大阪・京都）
-- Supabase ダッシュボード → SQL Editor に貼り付けて実行（無料・即時）。
-- これを実行しないと、愛知/大阪/京都の店舗 INSERT が制約違反で失敗する。

alter table public.stores drop constraint if exists stores_pref_check;

alter table public.stores
  add constraint stores_pref_check
  check (pref in ('東京都','神奈川県','千葉県','埼玉県','愛知県','大阪府','京都府'));
