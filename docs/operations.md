# 運用メモ（2026-10 改修後）

## 仕組み
- 収集: GitHub Actions `Crawl sources`（毎時 :17 / :47）が `web/scripts/crawl.ts` を実行。
  - 8サイトずつ並列に巡回（317サイトで約1分。旧版は20〜28分かかり30分の上限で打ち切られていた）。
  - 前回の巡回より後の記事がフィードから流れていそうな場合は、WordPress のフィードを `?paged=2〜4` で遡って取りこぼしを防ぐ。
  - 120日より古い記事は取り込まない（新規開店のリードとして古いため）。
  - 実行結果（新しく取り込んだ店・取得に失敗した情報源）は Actions の実行画面の Summary に出る。3割以上の情報源で失敗したら実行が失敗扱いになる。
- 削除: GitHub Actions `Purge old data`（毎日 0:00 JST）が `web/scripts/purge.ts` で2年より前の店・記事を削除。
- 画面: Vercel（`web/`）。一覧は掲載日が直近120日の店を最初に表示し、それより前は一覧の最後の「さらに古い店も読み込む」で追加する。
- 情報源の状況: https://chiiki-radar.vercel.app/sources （取得できていないサイト・開店記事が長く出ていないサイトの一覧）

## 店をまとめるルール（2026-10-08 確定）
- まとめる（1枚のカード）: 同じ市区町村で店名が同じ／電話番号が同じで店名も同じ店と言える。
- まとめずに「重複の可能性あり」を付ける: 同じ市区町村に似た店名／電話番号が同じなのに店名が違う／同じ都府県の別の市区町村に同名店（チェーンの別店舗の可能性）。
- 別の都府県の同名店は別の店として扱う。

## 読み取りルールを直すとき
- ルールは `web/scripts/lib/normalize.ts`（判定・店名・住所・電話・日付・ジャンル）、組み立ては `web/scripts/lib/extract.ts`。
- 直したら `cd web && npx tsx scripts/test-extract.ts` を実行し「全件 OK」を確認する。
- 本番のフィードで試すには `npx tsx scripts/crawl.ts --dry-run`（DBに書き込まず、取り込む店を表示）。特定サイトだけなら `npx tsx scripts/crawl.ts <サイト名の一部> --dry-run`。
- 市区町村の一覧は `web/scripts/lib/municipalities.ts`（Geolonia 住所データ CC BY 4.0 から抜粋）。

## 自動収集が止まったとき
- 画面上部に「⚠ 自動取込が○時間止まっています」と出る（最終取込から8時間以上）。
- よくある原因: GitHub は「60日間コードの更新がない公開リポジトリ」の定期実行を自動で停止する（2026-09-14〜22 に実際に停止した）。
  - 対処: GitHub のリポジトリ → Actions → 左の `Crawl sources` → 「Enable workflow」を押す（`Purge old data` も同様）。
- `SUPABASE_SECRET_KEY` を作り直した場合は、GitHub の Settings → Secrets の値も更新する。
