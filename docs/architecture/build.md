# ビルドと依存

最終更新: 2026-09-28。ステータス: **正典**。

責務: 事前の組み立て、作り直しを押す仕組み（HMR）、足す依存の一覧、リポジトリの外に置いたものを持つ。
読む時: `pnpm run build` / `dev` の挙動を知りたい・依存を足すとき。
直す時: 組み立て・開発サーバ・依存の一覧を変えたとき。

## 節の索引

| 節              | 中身                                                                 |
| --------------- | -------------------------------------------------------------------- |
| ## ビルドと依存 | 事前の組み立て、作り直しを押す仕組み、**足す依存の一覧（承認済み）** |

## ビルドと依存

- **成果物は事前に組み立てて `dist/browser/` に置き、起動（`src/main.ts`）は置いてあるものを読む**
  （`docs/architecture/adr/0006-prebuild-browser.md`）。作るのは `pnpm run build`
  （`scripts/build-ui.ts`）だけで、`pnpm run dev` も起こす前に1回組み立てる（HMR を止めたときに戻る先）
- `pnpm run build` が起こすのは `node node_modules/vite/bin/vite.js build src/browser --config vite.config.ts --outDir dist/browser`
  の1本で、`main.js` と `main.css` の対が置かれる（名前をハッシュ付きにせず固定する理由と、JS API ではなく
  CLI を起こす理由は `docs/architecture/adr/0007-vite-build-cli.md`）
- **`dist/` は `.gitignore` する。** `package.json` の `prepare` が `pnpm run build` を呼ぶので、
  リポジトリを取り直して `pnpm install` を打てば組み立てまで済む。**依存が変わらない `pnpm install` は
  `prepare` を飛ばす**ので、`git pull` のあとの組み立ては `mise run setup`（`mise.toml` の `setup` タスク。
  `pnpm run build` を明示して打つ）に任せる（`tsukumo` はグローバルへのリンクでこのリポジトリを
  指しているので、**「配布」の実体はこのリポジトリそのもの**）
- **cwd に依存してよいのは起動先プロジェクトのものだけ。** 作業ディレクトリ・
  `develop/task/`・相対指定で渡した素材（`TSUKUMO_CHARACTER` に相対パスを渡した場合）
  はそこに当たる。**自分で持ち歩くもの（既定の立ち絵・`node_modules` の外部ライブラリ）は
  tsukumo 自身の場所から読む**（`src/server/adapter/bundled-path.ts`）。`tsukumo` コマンドをどの
  プロジェクトのディレクトリで起こしても見つかるようにするための区別
- **リポジトリの外に置いたのは `pnpm add --global "link:<リポジトリ>"` の2つだけ**（2026-09-12。
  2026-09-27 に `bun link` から移し、2026-10-02 に pnpm 12 の `pnpm link` が `--global` を受け付けない
  ので `pnpm add --global` のリンク形式へ移した。打つのは `mise run setup`）。`~/Library/pnpm/bin/tsukumo`
  （実体への**シンボリックリンクではなく**、`bin/tsukumo` のシバン行を読んで
  `exec <そのシバンの処理系> <bin/tsukumo のパス>` を生成するシム）と `~/Library/pnpm/global/`
  配下（pnpm が管理する登録簿。リポジトリへのリンクなので、変更はそのまま次の起動に反映される）。
  シェルの設定ファイルは、`$PNPM_HOME/bin` が `PATH` に無いときだけ `mise run setup` が
  `pnpm setup --force` で pnpm の区画（`# pnpm` 〜 `# pnpm end`）を書き直す。消すときは `pnpm remove --global tsukumo`
- **`bin/tsukumo` は POSIX sh**（`#!/bin/sh`）。自分の実体（シムが渡すパスも、直接の symlink も）を
  辿って根を求め、`mise -C <根> which node` で得た node（mise が無い・失敗したときは `PATH` の
  `node`）で `<根>/src/cli.ts` を起こす。PATH の先頭の node が `mise.toml` の版と一致する保証が無い
  リポジトリの外からでも、`mise.toml` が固定した版で動く
- **成果物が無ければ起動しない**（起動時の前提不足。理由に `pnpm run build` を添える）。**ソース
  （`src/browser/` と `src/shared/`）のほうが新しければ、1行知らせてそのまま配る**（古くても画面は
  動くので止めず、黙って配らないことで事故を防ぐ）。HMR と違い、ここは `src/shared/` も見る

**作り直しを押す仕組み。** 開発中は HMR で差し替える。`pnpm run dev`（= `pnpm run build && node src/cli.ts --dev`）で起こすと、
`src/server/view-server/adapter/ui-dev-server.ts` が Vite の開発サーバを **middleware mode** で起こし、
ビューサーバ（`node:http`）に差し込む。設定は組み立てと同じ `vite.config.ts` で、root は `src/browser/`。

- **配り方は `server.ts` の `ViewUi` の合併型**（`bundle` / `dev`）。`dev` のとき、ページは
  `<script type="module" src="/main.tsx">` を開発サーバの `transformIndexHtml` に通したもので、
  **経路の表に無い要求だけ**を開発サーバへ回す（`/rpc`・`/vendor/`・`/character/`・`/prompt-image/`・`/report-image/` の
  経路と守り方は変わらない。`/assets/` の対は `dev` のあいだ 404）
- **HMR の WebSocket は `/vite-hmr`**。`/ws` の受け口は合わない upgrade を閉じるので、Vite が受ける
  upgrade は触らずに譲る（`ownsUpgrade` / `yieldsUpgrade`）
- **本番（`tsukumo`・`pnpm run start`）では Vite を読み込まない。** `vite` は `startUiDevServer` の中で
  動的に import し、呼ぶのは `--dev` のときだけ（常に入れると仕事中の保存で画面が差し替わりうる）
- **開発サーバは `dist/browser/` を書き換えない**（次の起動に乗せるには `pnpm run build` が要る）。
  **型を見ない**ので、型エラーだけのコードはそのまま当たる。**当たるのはブラウザに配る側だけ**:

| 直した場所                                                        | どうなるか                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/browser/` の部品（`.tsx`）                                   | 差分が当たり、部品の状態を保つ（React Fast Refresh）                                                   |
| `src/browser/**/*.module.css`                                     | 差分が当たる（class 名は開発サーバの中で JS と CSS が揃う）                                            |
| `src/browser/` の部品以外の `.ts`                                 | Vite が当てられないと判断すればページごと読み込み直す。状態は繋ぎ直しの `hello` で戻る                 |
| `src/shared/`・`src/server/`・`src/` 直下（`src/wiring/` を含む） | **プロセスの上げ直しが要る**。そのあと `src/browser/` か `src/shared/` を保存すると HMR が止まる（下） |

- **サーバ側のソースが起動時から変わっていたら、HMR を止める。** `src/shared/` は**畳み込みがサーバ側でも
  回っている**ので、同じ作業ツリーで両方が変わると新しい契約の画面が古いサーバと話すことになる。開発
  サーバの始めに**サーバ側のソース（`src/` の下で `browser/` 以外）の中身の指紋**を取り、保存のたびに
  （プラグインの `hotUpdate`）取り直して比べる（`source-fingerprint.ts`。時刻ではなく中身で比べ、
  取れなかったときは当てる）。違えば何も当てず、**配り方を起動のときに読んだ対（`bundle`）へ戻して**
  `refresh` の `page` を押し、理由の1行をペインに出す
- **`refresh` フレーム**（`docs/architecture.md`「ServerFrame」）は、この戻すときの `page` にだけ使う（`style` は押さない）

**足す依存**（**ユーザーの承認済み**。ここに無いものを足すときは改めて承認を得る。承認の日付は
`docs/history/decision.md`「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」）:

| 種別    | パッケージ                                                                         | 用途                                                                                           |
| ------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| runtime | `react` `react-dom`                                                                | browser                                                                                        |
| runtime | `ws`                                                                               | core の WebSocket サーバ                                                                       |
| runtime | `react-markdown` `remark-gfm` `rehype-raw` `rehype-sanitize` `rehype-highlight`    | Markdown                                                                                       |
| runtime | `remark-cjk-friendly`                                                              | CJK の強調（`**「…」**`）                                                                      |
| runtime | `remeda`                                                                           | 型ガードなど一般的な小物（`isPlainObject` / `isObjectType`）                                   |
| runtime | `mermaid` `chart.js` `highlight.js`                                                | ブラウザへそのまま配る外部ライブラリ（`docs/architecture/browser.md`「重いライブラリ」）       |
| dev     | `@types/react` `@types/react-dom` `@types/ws` `@testing-library/react` `happy-dom` | 型とテスト                                                                                     |
| dev     | `playwright-core`                                                                  | 画面の確認（`scripts/capture-*.ts`）と E2E（`docs/architecture/testing.md`）                   |
| dev     | `vitest` `vite`                                                                    | テストランナーとブラウザ側の組み立て・開発サーバ                                               |
| dev     | `@vitejs/plugin-react` `oxc-transform-react`                                       | JSX の変換と React Compiler（`docs/coding-standards.md`「手でメモ化しない」）。2026-09-29 承認 |
| dev     | `storybook` `@storybook/react-vite`                                                | 部品を props ごとに並べて見る（`pnpm run storybook`）                                          |

**Storybook は本体と同じ `vite.config.ts` を読む**（`.storybook/main.ts` の `viteConfigPath`。
`build` の節だけは Storybook が捨てる）。CSS Modules の class 名は Vite が CSS の中身と行から焼く
（置き場の root に依存しない）ので、`pnpm run build` の成果物と同じ綴りになる。部品が実行時に取りに
行く `/character/<pack>/<file>` は同梱の `characters/` を、`/vendor/<name>` は `readVendorAsset` の
対応表をそのまま Storybook の開発サーバが配る。型は `tsconfig.storybook.json` で別に見る——
Storybook の型定義（`react-docgen-typescript` ほか）が TypeScript 7 の型と噛み合わず、
ライブラリの `.d.ts` の検査を外す必要があるため（本体の `tsconfig.json` は外さない）。

`zod` と `@anthropic-ai/claude-agent-sdk` はある。`ws` を選ぶのは**ランタイム固有の API に寄せない**ため。
**`playwright-core` はブラウザを落とさず手元の Google Chrome を動かし**、テストランナー（`@playwright/test`）は足さない。
