# デプロイ手順 (GitHub Pages)

このアプリケーションは静的ファイル（HTML/CSS/JS）のみで構成されているため、GitHub Pagesで簡単に公開できます。

## 手順

1.  **GitHubリポジトリの作成**
    *   GitHubに新しいリポジトリを作成します（例: `drive-route-suggestion`）。

2.  **ファイルのアップロード**
    *   作成したリポジトリに以下のファイルをコミット＆プッシュします。
        *   `index.html`
        *   `styles.css`
        *   `app.js`

3.  **GitHub Pagesの設定**
    *   GitHubのリポジトリ画面で「Settings」タブをクリックします。
    *   左メニューの「Pages」を選択します。
    *   「Build and deployment」の「Source」が「Deploy from a branch」になっていることを確認します。
    *   「Branch」で `main` (または `master`) ブランチを選択し、「/ (root)」フォルダを選択して「Save」をクリックします。

4.  **公開の確認**
    *   数分後、画面上部に表示されるURL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）にアクセスすると、アプリが動作します。

## 注意事項
- **API制限**: OSRMやNominatimは無料のパブリックAPIを使用しています。短時間に大量のリクエストを送信すると制限がかかる場合があります。
- **HTTPS**: GitHub PagesはデフォルトでHTTPS化されるため、位置情報の取得（Geolocation API）が正常に動作します。