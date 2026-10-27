# ビルドと依存: 組み立てと開発サーバ

ステータス: **正典**。入口は `docs/architecture/build.md`（ビルドと依存の全体）。

責務: 事前の組み立て、配布の実体、リポジトリの外に置いたもの、作り直しを押す仕組み（HMR）。
読む時: `pnpm run build` / `dev` の挙動を知りたいとき。
直す時: 組み立て・起動の前提・開発サーバを変えたとき。

## ビルドと依存

### 事前の組み立てと配布

- **成果物は事前に組み立てて `dist/browser/` に置き、起動（`src/main.ts`）は置いてあるものを読む**
  （`docs/architecture/adr/0006-prebuild-browser.md`）。作るのは `pnpm run build`
  （`scripts/dev/build-ui.ts`）だけで、`pnpm run dev` も起こす前に1回組み立てる（HMR を止めたときに戻る先）
- `pnpm run build` は、`src/browser/`・`src/shared/` と `vite.config.ts`・`pnpm-lock.yaml`・`tsconfig.json`・後処理（`scripts/dev/lib/strip-css-comment.ts`）の指紋が前回の組み立てと同じなら、vite を起こさず1行知らせて終わる（`scripts/dev/lib/build-ui-skip.ts`）
- 組み立ての後処理で `main.css` のブロックコメントを postcss で落とす（`cssMinify` を入れない理由は `docs/architecture/adr/0007-vite-build-cli.md`）。
  配るときは、読んだ成果物の中身から決めた ETag を付けて `cache-control: no-cache` で送り、`If-None-Match` が合えば 304 を返す。
  ページの `<head>` には `markdown-renderer.js` と `lib.js` の `<link rel="modulepreload">` を置く（`dev` の配り方は変えない）
- `pnpm run build` が起こすのは `node node_modules/vite/bin/vite.js build src/browser --config vite.config.ts --outDir dist/browser`
  の1本で、入口の `ui.js` と `main.css` の対と、`import()` で分けたチャンク（`markdown-renderer.js`・`task-body.js`・`markdown-editor-surface.js`・`character.js`・`token-usage.js`・`achievement.js` と、複数のチャンクが共に読む `lib.js` ほか組み立てが括り出す共有のチャンク）が置かれる
  （名前をハッシュ付きにせず固定する理由と、JS API ではなく CLI を起こす理由は
  `docs/architecture/adr/0007-vite-build-cli.md`。分け方は `docs/architecture/browser.md`「重いライブラリ」）
- **`dist/` は `.gitignore` する。** `package.json` の `prepare` が E2E と撮影に使う
  Playwright の headless shell の導入（`~/Library/Caches/ms-playwright` の共有キャッシュ。入っていれば飛ばす）と
  `pnpm run build` を呼ぶので、リポジトリを取り直して `pnpm install` を打てば組み立てまで済む。**依存が変わらない `pnpm install` は
  `prepare` を飛ばす**ので、`git pull` のあとの組み立ては `mise run setup`（`mise.toml` の `setup` タスク。
  `pnpm run build` を明示して打つ）に任せる（`tsukumo` はグローバルへのリンクでこのリポジトリを
  指しているので、**「配布」の実体はこのリポジトリそのもの**）
- **tsukumo-plugins（タスク運用のスキル・agent・hook）は git submodule で `vendor/tsukumo-plugins` に取り込み、コミットで固定する。**
  `package.json` を持たず pnpm の git 依存にできないので submodule にし、取り込みは `prepare` の
  `git submodule update --init`（`pnpm run build` の前）が済ませる。
  依存が変わらないと `prepare` は走らないので、`pnpm run check` も段を組む前に記録の版とのずれを同じコマンドで揃える。
  `vendor/tsukumo-plugins/.claude-plugin/plugin.json` が無ければ
  起動は前提不足で止まる（直し方は `git submodule update --init`。`TSUKUMO_DRIVER=fake` は見ない）。
  取り込んだ `skills/` の各ディレクトリと `agents/` の各定義が全部、利用者の設定ディレクトリ（`CLAUDE_CONFIG_DIR`、無ければ `~/.claude`）にあれば、
  セッションには載せず（二重に並ぶのを避ける）、起動時に stderr へ1行出す。一部だけなら欠けを作らないよう載せ、欠けた名前を1行で知らせる。
  取り込みの `plugins/tsukumo-figure`（図のスキル `figure-capture`）は任意で、ワークフローの判定とは独立に載せる。
  `plugins/tsukumo-figure/.claude-plugin/plugin.json` が読めないときは黙って載せず（起動は止めない）、
  設定ディレクトリに `skills/figure-capture` があるときも載せず、起動時に stderr へ1行出す。`vendor/` は文書の参照検査
  （`scripts/document/lib/repository-reference.ts`）と整形（`.prettierignore`）の対象外。新しくするには
  `git -C vendor/tsukumo-plugins fetch && git -C vendor/tsukumo-plugins checkout <コミット>` のあと、親で `vendor/tsukumo-plugins` を `git add` する
- **cwd に依存してよいのは起動先プロジェクトのものだけ。** 作業ディレクトリ・
  `.tw/`・相対指定で渡した素材（`TSUKUMO_CHARACTER` に相対パスを渡した場合）
  はそこに当たる。**自分で持ち歩くもの（既定の立ち絵・`node_modules` の外部ライブラリ）は
  tsukumo 自身の場所から読む**（`src/server/adapter/bundled-path.ts`）。`tsukumo` コマンドをどの
  プロジェクトのディレクトリで起こしても見つかるようにするための区別
- **リポジトリの外に置いたのは `pnpm add --global "link:<リポジトリ>"` の2つだけ**（`bun link` から移し、さらに pnpm 12 の `pnpm link` が `--global` を受け付けない
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
- **成果物が無ければ起動しない**（起動時の前提不足。理由に `pnpm run build` を添える）。**組み立てが成果物の隣
  （`dist/browser/source-fingerprint.txt`）にソース（`src/browser/` と `src/shared/`）の中身の指紋を置き、
  起動時にいまのソースの指紋と比べて違えば、または指紋が無ければ、1行知らせてそのまま配る**
  （更新時刻は見ないので、`git checkout` で時刻だけ動いても知らせない。古くても画面は動くので止めず、
  黙って配らないことで事故を防ぐ）。HMR と違い、ここは `src/shared/` も見る

### 作り直しを押す仕組み

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
