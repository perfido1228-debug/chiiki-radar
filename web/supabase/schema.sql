-- 地域密着レーダー データベーススキーマ
-- 実行: Supabase Dashboard > SQL Editor に貼り付けて実行

-- ==========================================
-- 拡張
-- ==========================================
create extension if not exists pg_trgm;

-- ==========================================
-- sources: 情報源サイトマスタ（号外NET 等の設定）
-- ==========================================
create table if not exists public.sources (
  id bigserial primary key,
  name text not null,
  url text not null unique,
  rss_url text,
  source_type text not null check (source_type in ('号外NET','経済新聞','独立系ブログ','つうしん系','ku2shin系')),
  pref text,
  city text,
  enabled boolean not null default true,
  last_crawled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_sources_enabled on public.sources (enabled) where enabled = true;
create index if not exists idx_sources_pref on public.sources (pref);

-- ==========================================
-- articles: 各ソースから取得した個別記事
-- ==========================================
create table if not exists public.articles (
  id bigserial primary key,
  source_id bigint not null references public.sources(id) on delete cascade,
  article_url text not null unique,
  title text not null,
  content text,
  thumbnail_url text,
  published_at timestamptz not null,
  raw_html text,
  parsed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_articles_published_at on public.articles (published_at desc);
create index if not exists idx_articles_parsed on public.articles (parsed) where parsed = false;

-- ==========================================
-- stores: 店舗マスタ（重複排除後の統合単位）
-- ==========================================
create table if not exists public.stores (
  id bigserial primary key,
  name text not null,
  name_normalized text not null,
  addr text,
  addr_normalized text,
  pref text not null check (pref in ('東京都','神奈川県','千葉県','埼玉県')),
  city text not null,
  tel text,
  tel_normalized text,
  genre text,
  open_date date,
  listed_date date not null,
  thumbnail_url text,
  duplicate_flag boolean not null default false,
  duplicate_of_id bigint references public.stores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stores_listed_date on public.stores (listed_date desc);
create index if not exists idx_stores_pref_city on public.stores (pref, city);
create index if not exists idx_stores_tel_normalized on public.stores (tel_normalized) where tel_normalized is not null;
create index if not exists idx_stores_name_normalized on public.stores (name_normalized);
create index if not exists idx_stores_name_trgm on public.stores using gin (name_normalized gin_trgm_ops);

-- 自動更新トリガー
create or replace function update_stores_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_stores_updated_at on public.stores;
create trigger trg_stores_updated_at
  before update on public.stores
  for each row execute function update_stores_updated_at();

-- ==========================================
-- store_articles: 店舗と記事の多対多（統合されたソース一覧用）
-- ==========================================
create table if not exists public.store_articles (
  store_id bigint not null references public.stores(id) on delete cascade,
  article_id bigint not null references public.articles(id) on delete cascade,
  primary key (store_id, article_id)
);

create index if not exists idx_store_articles_store on public.store_articles (store_id);

-- ==========================================
-- RLS ポリシー
-- ==========================================
alter table public.sources enable row level security;
alter table public.articles enable row level security;
alter table public.stores enable row level security;
alter table public.store_articles enable row level security;

-- anon（フロントエンド）からは全テーブルSELECTのみ許可
drop policy if exists "anon select sources" on public.sources;
create policy "anon select sources" on public.sources
  for select to anon using (true);

drop policy if exists "anon select articles" on public.articles;
create policy "anon select articles" on public.articles
  for select to anon using (true);

drop policy if exists "anon select stores" on public.stores;
create policy "anon select stores" on public.stores
  for select to anon using (true);

drop policy if exists "anon select store_articles" on public.store_articles;
create policy "anon select store_articles" on public.store_articles
  for select to anon using (true);

-- service_role（GitHub Actionsのcron）は RLS をバイパスするので追加ポリシー不要

-- ==========================================
-- ビュー: フロントエンドが一発で取得するための集約ビュー
-- ==========================================
create or replace view public.v_stores_with_sources as
select
  s.id,
  s.name,
  s.addr,
  s.pref,
  s.city,
  s.tel,
  s.genre,
  s.open_date,
  s.listed_date,
  s.thumbnail_url,
  s.duplicate_flag,
  s.duplicate_of_id,
  coalesce(
    json_agg(
      json_build_object(
        'name', src.name,
        'url', a.article_url,
        'type', src.source_type
      )
      order by a.published_at desc
    ) filter (where a.id is not null),
    '[]'::json
  ) as sources
from public.stores s
left join public.store_articles sa on sa.store_id = s.id
left join public.articles a on a.id = sa.article_id
left join public.sources src on src.id = a.source_id
group by s.id;

-- ==========================================
-- 2年超のデータを削除する関数（GitHub Actions から日次呼出）
-- ==========================================
create or replace function public.purge_old_data()
returns void as $$
begin
  delete from public.stores where listed_date < now() - interval '2 years';
  delete from public.articles where published_at < now() - interval '2 years';
end;
$$ language plpgsql security definer;
