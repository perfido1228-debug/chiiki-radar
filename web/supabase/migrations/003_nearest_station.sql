-- 最寄駅列を追加 + ビュー更新
alter table public.stores add column if not exists nearest_station text;

drop view if exists public.v_stores_with_sources;

create view public.v_stores_with_sources as
select
  s.id, s.name, s.addr, s.pref, s.city, s.tel, s.genre,
  s.nearest_station,
  s.open_date, s.listed_date, s.thumbnail_url,
  s.duplicate_flag, s.duplicate_of_id,
  (select a2.title from public.articles a2
    join public.store_articles sa2 on sa2.article_id = a2.id
    where sa2.store_id = s.id
    order by a2.published_at desc limit 1) as article_title,
  coalesce(
    json_agg(
      json_build_object('name', src.name, 'url', a.article_url, 'title', a.title, 'type', src.source_type)
      order by a.published_at desc
    ) filter (where a.id is not null),
    '[]'::json
  ) as sources
from public.stores s
left join public.store_articles sa on sa.store_id = s.id
left join public.articles a on a.id = sa.article_id
left join public.sources src on src.id = a.source_id
group by s.id;
