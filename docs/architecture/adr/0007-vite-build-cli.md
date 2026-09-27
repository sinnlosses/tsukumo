# 組み立ては `vite build` の CLI を子プロセスで起こす（2026-09-27）

**`bun build` をやめ、`vite build` で組み立てる。** Node + Vite + Vitest へ移す段の3段目で、
Vite 前提の道具（Storybook・React Compiler）を本物と同じ設定で使えるようにするため。設定は
リポジトリ直下の `vite.config.ts` の1つで、入口の置き場（`src/browser/`）と出し先（`dist/browser/`）は
`bundle.ts` が CLI の引数で渡す（テストは一時ディレクトリの入口で失敗の側を確かめる）。

- **出す名前は `main.js` と `main.css` に固定する。** Vite の既定はハッシュ付きの名前
  （`assets/main-<hash>.js`）だが、サーバは起動時に読んでメモリから `/assets/ui.js` と
  `/assets/style.css` で配るので、名前で古さを見分ける必要が無い。`readPair` はこの2つの名前を
  読むだけで、拡張子で探さない（出し先に別の `.js` が残っていても拾い違えない）。出し先は毎回
  空にする（`emptyOutDir`。空にするのは組み立てが通って書き出す直前だけなので、壊れた保存で配っている
  ものは消えない）
- **JS API ではなく CLI を `node` の子プロセスで起こす。** Vite の JS API は呼んだプロセスの
  `process.env.NODE_ENV` を書き換えるので、常駐するサーバの中で呼ぶと、組み立て1回が
  サーバ全体の環境を変える。子プロセスなら組み立ての副作用はそこで閉じ、テストから呼んでも
  起動と同じ `node` で組み立てる。子プロセスを起こすのは前と同じ `bundle.ts` の1ファイル
- CLI の失敗の出力は、端末でなくても色の制御文字が入り、vite 自身のスタックが続く。理由として
  ターミナルに出す前に両方を落とす
- tsconfig の `verbatimModuleSyntax` のままだと、`import { type Element } from "hast"` が
  `import "hast"` として残り、型しか持たないパッケージを解決できずに止まる。`vite.config.ts` で
  型だけの import を読み込みごと消す（`onlyRemoveTypeImports: false`。`bun build` と同じ振る舞い）
- **React は本番版で束ねられる**（`vite build` が `process.env.NODE_ENV` を `"production"` に置き換える）。
  `bun build` は開発版を束ねていたので、開発版だけが出す警告はブラウザのコンソールに出なくなった
- 縮めない（`minify: false`）。ローカルから配るだけなので、読める成果物のほうが調べやすい
