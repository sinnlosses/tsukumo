# 外部ライブラリは CDN から読まず、同梱して自分で配る

レポートに図・グラフ・コードの色付けを入れるため、外部ライブラリ（highlight.js / mermaid /
Chart.js）を使うことにした（2026-09-10 のユーザーの決定。2026-09-11 の方針転換でも
**リッチな表示は残す**と決まっている）。ただし**CDN から読む形は採らない**。

このページは**会話の内容を持っている**（`docs/coding-standards.md`「会話内容の扱い」）。
外部スクリプトはそのページの中身を読めるうえ、表示のたびに外部へリクエストが飛ぶ。
ローカルの HTTP サーバ（`127.0.0.1`）から配れば、**機能はそのまま・表示時の外部通信はゼロ**に
できる。配る名前は allowlist の対応表で、リクエストのパスからファイル名を組み立てない
（`..` で外へ出る経路を作らない。`src/shared/vendor-asset.ts` と `src/server/view-server/adapter/server.ts`）。

**実ファイルは `node_modules` から読む**（2026-09-20。ユーザーの指示「外部ライブラリは
package.json に定義したり」で、cdnjs から落としたものを `vendor/` に置く形をやめた）。
名前が `node_modules` のどのファイルを指すかは `src/server/view-server/adapter/vendor-asset.ts` の対応表1つが持ち、
`src/shared/` には名前と Content-Type しか置かない（パス解決は外の世界に触る仕事なので
adapter 側）。**mermaid と chart.js は `package.json` で版を固定する**（`^` を付けない）。素の
JavaScript をそのままブラウザへ配っていて描けるかどうかは目で見るまで分からず、mermaid の版は
`src/server/report/core/report-notation.ts` が挙げる図の10種の根拠でもあるため。highlight.js のテーマだけは
`^` で上げてよい（色を当てる class を出すのは `rehype-highlight`（`lowlight`）が抱えるほうなので、
**テーマの中身が食い違っていないか**だけを見る。2026-09-22 時点では配る 11.12.0 と `lowlight` の
11.11.2 でバイト一致）。

**大きいものは使うときだけ読む。** mermaid は 5.3MB あるので、レポートが実際に mermaid の
コードブロックを書いたときにだけ `<script>` を足す（Chart.js も同じ）。**だから `vite build` の
束ねには入れない**——入れると図が1つも無いレポートでも最初の読み込みで運ぶことになる。
highlight.js は `rehype-highlight` として束ねに入り、ブラウザへ配るのはテーマの CSS だけ。
