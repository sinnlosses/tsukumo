# vendor（同梱している外部ライブラリ）

**ここのファイルは編集しない。** 外部からダウンロードしたものをそのまま置いてある。

同梱している理由は、**このページが会話の内容を持っている**ため（`docs/coding-standards.md`
「会話内容の扱い」）。CDN から読むと、レポート本文が載ったページで外部スクリプトが動き、
表示のたびに外部へリクエストが飛ぶ。同梱してサイドカーの HTTP サーバ（`127.0.0.1`）から配れば、
**表示時の外部通信はゼロ**になる（2026-09-10 のユーザーの決定）。

| ファイル | 版 | 取得元 | ライセンス | 用途 |
| --- | --- | --- | --- | --- |
| `highlight.min.js` | 11.9.0 | cdnjs | BSD-3-Clause | コードの色付け |
| `highlight-theme.min.css` | 11.9.0 (github-dark) | cdnjs | BSD-3-Clause | 同上のテーマ |
| `chart.umd.min.js` | 4.4.1 | cdnjs | MIT | グラフ |
| `mermaid.min.js` | 11.15.0 | cdnjs | MIT | 図 |

更新するときは、同じ URL の版だけを差し替えて上の表も直す:

```bash
curl -sL -o vendor/highlight.min.js https://cdnjs.cloudflare.com/ajax/libs/highlight.js/<版>/highlight.min.js
curl -sL -o vendor/highlight-theme.min.css https://cdnjs.cloudflare.com/ajax/libs/highlight.js/<版>/styles/github-dark.min.css
curl -sL -o vendor/chart.umd.min.js https://cdnjs.cloudflare.com/ajax/libs/Chart.js/<版>/chart.umd.min.js
curl -sL -o vendor/mermaid.min.js https://cdnjs.cloudflare.com/ajax/libs/mermaid/<版>/mermaid.min.js
```

**mermaid は 3.2MB と大きい**ので、`chart.umd.min.js` ともども**レポートが実際にその記法を
使ったときだけ読み込む**（`src/view.ts`）。`highlight.min.js` は 118KB なので常に読む。
