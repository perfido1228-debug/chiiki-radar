# クロール定期実行のセットアップ（cron-job.org → GitHub）

## 背景
GitHub Actionsの`schedule`は**Free枠 / publicリポジトリで高負荷時に無音でスキップされる**。実測で24回/日のはずが4回しか走らない日がある。
対策として**cron-job.org（無料・確実）から GitHub の workflow_dispatch API を毎時叩く**構成に切り替える。
既存の `.github/workflows/crawl.yml` はそのまま再利用（`workflow_dispatch` は既に許可済み）。

## 手順

### 1. GitHub Fine-grained Personal Access Token を作成
1. https://github.com/settings/personal-access-tokens/new を開く
2. Token name: `chiiki-radar-cron`
3. Expiration: `90 days`（期限切れ前にリフレッシュ。無期限は不可）
4. Repository access: `Only select repositories` → **`perfido1228-debug/chiiki-radar`** を選択
5. Permissions → Repository permissions:
   - **Actions: Read and write**
   - （他は触らない）
6. `Generate token` → 画面に表示された `github_pat_xxx...` をコピー（この画面を閉じると二度と見られない）

### 2. cron-job.org に登録
1. https://cron-job.org/ でサインアップ（GitHub認証でOK）
2. Dashboard → `Create cronjob`
3. 以下を設定:

| 項目 | 値 |
|------|-----|
| Title | `ChiikiRadar crawl` |
| URL | `https://api.github.com/repos/perfido1228-debug/chiiki-radar/actions/workflows/crawl.yml/dispatches` |
| Schedule | `Every hour` at minute `5`（GitHub本体のscheduleが0分なので5分ずらし衝突回避） |
| Enabled | ON |

4. `Advanced` タブ:
   - Request method: **POST**
   - Headers（`Add header` で3つ追加）:
     - `Authorization` = `Bearer <手順1でコピーしたPAT>`
     - `Accept` = `application/vnd.github+json`
     - `X-GitHub-Api-Version` = `2022-11-28`
   - Request body（`POST Body` を展開）:
     ```json
     {"ref":"main"}
     ```
   - `Treat response as failure if HTTP status is not 2xx` を ON

5. `Create cronjob` で保存

### 3. 疎通テスト
cron-job.org のジョブ一覧で、作成したジョブの `Test run` を押す。
成功すれば GitHub Actions の Actions タブに新しいワークフロー実行が出現する（`workflow_dispatch` トリガー）。
HTTP 204 が返れば OK。401/403 の場合は PAT のスコープ/選択リポジトリを見直す。

### 4. 既存の `schedule:` は残す
GitHub側が走らせてくれれば儲けもの、スキップされたら cron-job.org が拾う、の冗長構成。
クロール側は既存URL重複スキップで冪等なので二重発火しても安全。

## 運用メモ
- PAT は90日で失効 → 期限前にSlackやカレンダーでリマインド推奨
- cron-job.org の無料枠は毎分実行 / 50ジョブ / 履歴1ヶ月保存 → 十分
- ジョブ履歴は cron-job.org 上で確認可能。401連発していたらPAT失効を疑う
- GitHub API rate limit はPAT使用時5,000/hour → 毎時1コールは全く問題なし
