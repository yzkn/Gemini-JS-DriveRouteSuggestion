# デプロイ手順 (GitHub Pages)

このアプリケーションを GitHub Pages にデプロイする手順は以下の通りです。

## 手順

1.  **GitHub リポジトリの作成**
    - GitHub にログインし、新しいリポジトリ（例: `drive-route-suggestion`）を作成します。

2.  **ファイルのアップロード**
    - 作成したリポジトリに以下のファイルをアップロード（push）します。
        - `index.html`
        - `styles.css`
        - `app.js`

3.  **GitHub Pages の設定**
    - リポジトリの **Settings** タブをクリックします。
    - 左側のメニューから **Pages** を選択します。
    - **Build and deployment** > **Source** で `Deploy from a branch` を選択します。
    - **Branch** で `main` (または `master`) ブランチを選択し、フォルダを `/ (root)` に設定して **Save** をクリックします。

4.  **公開の確認**
    - 数分待つと、上部に `Your site is live at...` という URL が表示されます。その URL にアクセスして動作を確認してください。

## 注意事項
- このアプリは外部 API (Nominatim, OSRM, GitHub上のJSON) を使用しているため、インターネット接続が必要です。
- Nominatim API は短時間に大量のリクエストを送ると制限がかかる場合があります。