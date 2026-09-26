# tsukumo が外に依存しているものの洗い出し（2026-09-16 実測）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。

**ここでは決めない。** 書くのは「何に依存しているか」と「外せるか」の評価までで、実装も、外す順番も、
箱（Orca のタブのままか、アプリに包むか）の選択も含まない。箱の候補の比較は
`docs/research/app-shell.md` が持つ。

**問いの出どころ**: ユーザーの言葉（2026-09-15）「今、プロジェクト外のファイルで tsukumo が
依存しているものを洗い出してほしい。最終的に tsukumo をスタンドアロンで動かしたい」。

**実測値は時間が経つと変わる。** 下の数字はすべて 2026-09-16 に手元で測ったもので、前提にする前に
その場で確認し直す。

## 測った環境（2026-09-16）

| 項目           | 実測                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| OS             | macOS（Darwin 25.6.0）、zsh                                                                                  |
| `bun`          | **2つ入っている**。`~/.nodebrew/current/bin/bun` 1.4.2（PATH の先）と `~/.bun/bin/bun` 1.3.8                 |
| `node`         | `~/.nodebrew/current/bin/node` v22.13.1                                                                      |
| `orca`         | `/opt/homebrew/bin/orca` 1.4.203                                                                             |
| `claude`       | `~/.local/bin/claude` 2.1.272（**tsukumo はこれを使っていない**。下の表1の1行目）                            |
| Agent SDK      | `@anthropic-ai/claude-agent-sdk` 0.3.268（同梱バイナリの manifest は `2.1.268` / `darwin-arm64`）            |
| `node_modules` | 426MB（うち `@anthropic-ai` が 219MB、ブラウザ側だけが使う一式が約 23MB）                                    |
| `vendor/`      | 3.4MB（3ファイル）                                                                                           |
| 起動時のビルド | JS 2,381,102 バイトを 26〜32ms、CSS 23,208 バイトを 10ms 未満（`bun build --target=browser` を4回・2回計測） |

## 表を3つに分けた理由

「外に依存している」には性質の違う3つが混ざっている。同じ表に並べると、**外すべきものと、外に
あるのが正しいものが同じ重みに見える**ので分けた。

1. **本体が動くために要るもの** — ここが「スタンドアロン」の対象
2. **外にあるのが自然なもの（設定と作業対象）** — 無くても壊れないことだけが要件で、無くすのは目的でない
3. **開発と検証のときだけ要るもの** — 配布物には入らない

列はどの表も同じ。「外せるか」は **外せない / 外せる / 要検討** の3つだけを書く。

## 表1. 本体が動くために要るもの

| 何に依存しているか                                                                                                                                                  | どこで                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 無いとどうなるか                                                                                                                                                                | 外せるか                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Claude Code のネイティブバイナリ**                                                                                                                                | `node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`（202,081,536 バイト）を SDK が子プロセスで起こす。呼ぶのは `startSession`（`src/core/session-driver.ts`）の `query()` 1箇所                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | セッションが1つも起こせない。SDK は `Native CLI binary for darwin-arm64 not found. Reinstall @anthropic-ai/claude-agent-sdk without --omit=optional` で落ちる                   | **外せない**                                                                                             |
| **Anthropic への通信とログイン状態**                                                                                                                                | 上のバイナリが API に繋ぐ。`~/.claude/.credentials.json` は存在せず、macOS では Keychain 側。**tsukumo 自身は認証情報に触らない**（`src/core/` に該当するコードが1つも無い）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ターンが1つも終わらない（`relayMessages` が `session-ended` を流して終わる）                                                                                                    | **外せない**                                                                                             |
| **`~/.claude/` のユーザー設定一式**（settings・output-styles・skills・hooks）                                                                                       | `buildQuerySeedOptions`（`src/core/session-driver.ts`）が `settingSources` を渡していない。SDK の型定義は「When omitted, all sources are loaded (matches CLI defaults)」と書く（`sdk.d.ts` の `settingSources`）。実測の中身は `outputStyle: "Asuna"`、hooks と statusLine は `~/.orca/agent-hooks/claude-hook.sh` を呼ぶ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 人格が二重に効かなくなり、`~/.claude/skills/` の19個のスキルが使えなくなり、orca の hook が動かなくなる。**起動は止まらない**                                                   | **要検討**                                                                                               |
| **`~/.claude/projects/<cwd を符号化した名前>/*.jsonl`（transcript）**                                                                                               | `findSessionToResume` → `listSessions({ dir: cwd })` と `readRestoredEvents` → `getSessionMessages`（どちらも `src/core/session-driver.ts`）。このリポジトリぶんで 133 ファイル                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 続きから始まらず毎回新規になる（両方とも `try`/`catch` で `undefined` / 空に倒れる）                                                                                            | **外せない**                                                                                             |
| **Bun ランタイム**                                                                                                                                                  | `bin/tsukumo` の `#!/usr/bin/env bun`、`package.json` の `engines.bun >= 1.3` と `scripts.start`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 起動できない                                                                                                                                                                    | **要検討**                                                                                               |
| **起動のたびの `bun build` の子プロセス**                                                                                                                           | `bundleWithBun`（`src/core/bundle.ts`）が `execFile("bun", ["build", <entry>, "--target=browser"])` を2回（`buildUiScript` / `buildStyleSheet`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `src/cli.ts` の `main` が「CSS を組み立てられない」「ブラウザ側スクリプトを組み立てられない」で終了コード1（起動時の前提不足）                                                  | **外せる**                                                                                               |
| **実行時の `src/ui/` の一式とブラウザ側の npm 依存**                                                                                                                | 上のビルドが `bundledFilePath("src", "ui", "main.tsx")`（`UI_SCRIPT_ENTRY`）から辿る。react / react-dom / react-markdown / rehype-3種 / remark-2種 の8パッケージ＋推移的な依存で約 23MB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ビルドが失敗して上と同じ終了                                                                                                                                                    | **外せる**                                                                                               |
| **サーバ側の npm 依存**（SDK・`ws`・`zod`）                                                                                                                         | `src/core/session-driver.ts`（SDK）、`src/core/server.ts` の `WebSocketServer`（`ws`）、`src/protocol/*.ts`（`zod`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 起動できない                                                                                                                                                                    | **外せない**                                                                                             |
| **同梱物を `import.meta.url` から解くこと**                                                                                                                         | `bundledFilePath`（`src/core/bundled-path.ts`）が `new URL("../..", import.meta.url)` を基準にする。見ているのは `vendor/`・`characters/`・`src/ui/`・`test/fixture/fake-session.json`（`src/core/fake-driver.ts` の `DEFAULT_SCRIPT_URL`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ソースツリーごと置かれていないと同梱物が読めない（立ち絵なし・`vendor` が404・fake driver が起動しない）                                                                        | **要検討**                                                                                               |
| **`vendor/` の3ファイル**                                                                                                                                           | `VENDOR_ASSET_CONTENT_TYPES` の allowlist（`src/protocol/vendor-asset.ts`）と `writeVendorAsset`（`src/core/server.ts`）。mermaid 3.2MB / chart / highlight のテーマ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 図・グラフ・コードの色が出ない（404 を返して配信自体は続く）                                                                                                                    | **外せない**                                                                                             |
| **表示先のブラウザと `127.0.0.1` のポート**                                                                                                                         | `BIND_HOST = "127.0.0.1"`（`src/core/server.ts`）と `DEFAULT_VIEW_PORT = 7327`（`src/core/port-resolution.ts`）。ページを出すのは `Host.showView`（`src/core/host.ts`）の実装1つ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 配信はされるが誰も見ない                                                                                                                                                        | **外せない**                                                                                             |
| **`orca` コマンド**                                                                                                                                                 | `ORCA_COMMAND`（`src/core/orca-host.ts`）。使うのは `orca tab list` / `orca goto` / `orca tab create` の3つだけ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | タブが自動で開かないだけ（`createOrcaHost` は失敗を戻り値で返し、例外を投げない）                                                                                               | **外せる**                                                                                               |
| **oRPC**（`@orpc/server` `@orpc/contract` `@orpc/client` `@orpc/tanstack-query` 1.15.4。2026-09-26 に足した。推移的に `@orpc/*` の内部パッケージ約10個と `cookie`） | 読み取りの手続き（`/rpc`）とコマンドの手続き（`/ws`。2026-09-26 の段3）。契約は `src/shared/contract/`、受け手は機能の `adapter/<機能>-procedure.ts`、束ねるのは `src/router.ts`、`/rpc` に載せるのは `src/server/view-server/adapter/server.ts`（`@orpc/server/fetch` の `RPCHandler`）、`/ws` に載せるのは `session-socket.ts`（`@orpc/server/websocket` の `RPCHandler`。型宣言は `@orpc/interop` を辿らない）、呼ぶのは `src/browser/lib/rpc-client.ts`（`/rpc`）と `src/browser/stores/session.tsx`（`/ws`。`@orpc/client/websocket` の `RPCLink` に `src/browser/lib/socket.ts` が振り分けた応答だけを渡す）。**型宣言の不具合が2つある**: `@orpc/interop/dist/compression/index.d.mts` が公開物の中から CI の絶対パス（`/home/runner/work/orpc/...`）を import していて `@orpc/server/node` の型宣言がそれを辿る（→ `node` の受け口を使わず `fetch` の受け口に自前で橋渡しする）、`@orpc/shared` が任意の peer の `@opentelemetry/api` から型だけを import する（→ `src/types/opentelemetry-api.d.ts` に名指しの型の代役）。どちらも `skipLibCheck` を入れずに済ませた | 読み取りの画面（`@` 補完・トークン消費・コンテキスト・成果・暦・日記帳）が空・「取れない」になり、**画面からのコマンドが1つも通らなくなる**（依頼も送れない）。起動は止まらない | **外せる**（段1の表と手書きの HTTP、コマンドの和 `ClientCommand` と `/ws` の手書きの受け口に戻せば済む） |

「外せない」と書いたものの理由（1行ずつ）:

- **ネイティブバイナリ**: claude を動かすことが tsukumo の存在理由そのもの（`docs/requirements.md` 1章）
- **通信とログイン状態**: 会話が成立しない。ローカルで代替する対象ではない
- **transcript**: 正典は claude 自身が書いた transcript で、**tsukumo 側に複製を作らない**と決めてある（`src/core/session-restore.ts` 冒頭）
- **サーバ側の npm 依存**: `ws` は「`Bun.serve` に寄せない」規約の裏返しで、外すと Bun 固有APIへ戻る（`docs/coding-standards.md`）
- **`vendor/`**: CDN に戻すと**会話が載ったページから外部通信が出る**（`vendor/README.md`、2026-09-10 の決定）
- **表示先**: HTML を配る以上どこかに描く先が要る。どれにするかだけが選択肢（`docs/research/app-shell.md`）

## 表2. 外にあるのが自然なもの（設定と作業対象）

| 何に依存しているか                       | どこで                                                                                                           | 無いとどうなるか                                               | 外せるか                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| **`~/.tsukumo/state.json`**              | `defaultStatePath()`（`src/core/remembered-character.ts`）。**`homedir()` を読むのはここ1箇所だけ**              | 前回選んだキャラクターを覚えていないだけ（同梱の既定に落ちる） | **外せる**（が、外す対象ではない）     |
| **起動先（cwd）の `develop/tasks.json`** | `watchTaskSummary` の `TASKS_FILE_RELATIVE_PATH`（`src/core/task-summary.ts`）                                   | サイドバーのタスク一覧が出ないだけ（`onChange(undefined)`）    | **外せる**（が、外す対象ではない）     |
| **起動先（cwd）の `characters/local/`**  | `listCharacterPacks` の `LOCAL_PACK_NAME`（`src/core/character-pack.ts`）。`.gitignore` 済み                     | 同梱のパックだけになる                                         | **外せる**（が、外す対象ではない）     |
| **起動先（cwd）そのもの**                | `src/cli.ts` が `process.cwd()` を7箇所で渡す（`startSession` の `cwd`、続きから始めるセッションを選ぶ鍵の片方） | 作業対象が決まらない                                           | **外せない**（作業対象を指すのが役目） |

**「外す」べきかの判断**: 数えるが、表1とは分けた。設定（覚えたキャラクター）と作業対象（cwd と
その下のファイル）は**外にあるからこそ意味がある**もので、スタンドアロンの目標は「これらが無くても
動くこと」ではなく「**これらが無くても壊れないこと**」。表2の「無いとどうなるか」が全部「〜だけ」で
済んでいるのは、そこが既に満たされている証拠になっている。

## 表3. 開発と検証のときだけ要るもの

| 何に依存しているか                  | どこで                                                                                                                            | 無いとどうなるか                                   | 外せるか                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| **手元の Google Chrome**            | `scripts/capture-view.ts` の `chromium.launch({ channel: "chrome", headless: true })`                                             | 目視確認の画像が撮れない                           | **外せる**（本体の実行時依存ではない） |
| **開発ツール一式**                  | `package.json` の `devDependencies`（`typescript` / `oxlint` / `oxfmt` / `happy-dom` / `playwright-core` ほか）と `scripts.check` | `bun run check` が回らない                         | **外せる**（同上）                     |
| **`~/.bun/bin/tsukumo` の symlink** | `bun link` で作った `~/.bun/bin/tsukumo` → `~/.bun/install/global/node_modules/tsukumo` → リポジトリ（実測）                      | `tsukumo` と打てないだけ（`bun run start` は動く） | **外せる**（配布形と一緒に決まる）     |

## 外し方の候補

**実装しない。** ここに書くのは「外すとしたらどうするか」と「そのとき何が動くか」だけ。

### 起動のたびの `bun build` を事前ビルドの同梱に替える（表1で一番重い）

**消えるもの**:

- `execFile("bun", ["build", ...])` の2回と、失敗時の即時終了2箇所（`src/cli.ts` の
  「CSS を組み立てられない」「ブラウザ側スクリプトを組み立てられない」）。`src/core/bundle.ts` は
  丸ごと消えるか、ビルドのスクリプト側へ移る
- **実行時の `src/ui/` の一式（26ファイル）と、ブラウザ側だけが使う npm 依存8パッケージ**。配布物に
  入るのは成果物の 2,381,102 バイト＋ 23,208 バイトだけになり、`node_modules` 側の約 23MB が要らなくなる
- **実行時に `bun` を要求する経路が、入口の shebang 1つだけになる。** ランタイムの選択
  （Bun のまま進めるか Node へ寄せるか）を `bun build` に縛られずに決められるようになる

**増えるもの**:

- **成果物の置き場と鮮度の担保。** `src/core/bundle.ts` の冒頭は「ディスクに成果物を残さないので、
  古いものを配る事故も、`.gitignore` に足す必要も出ない（2026-09-12 決定）」と書いている。
  事前ビルドはこの決定を裏返すので、「古い成果物を配らない」を別の手段で担保することになる
- **開発中の手数。** いまは `src/ui/*.tsx` を直して起こし直すだけで反映される。事前ビルドにすると
  「直す → ビルド → 起こし直す」に増える。**開発中のホットリロードの要望はここに直接効く**が、
  どう実装するか（Bun か Vite か、そもそも要るか）は**この文書では決めない**
- **確認の手順。** 成果物は「どのコミットから作ったか」が見えないので、
  `docs/architecture.md`「手で確かめること」に見分ける手順が1つ増える

**いま外す理由の強さ**: **速さではない。** 起動時のビルドは JS が 26〜32ms、CSS が 10ms 未満で、
体感できる待ちになっていない（4回・2回の計測）。外して変わるのは (a) 配布物に `src/ui/` と
約 23MB ぶんの依存を入れずに済むこと、(b) ランタイムの選択が `bun build` に縛られなくなること、の
2つだけ。**逆に言えば、配布形とランタイムを決めないうちは外す必要が無い。**

**`bun` が PATH にあることへの依存は、下調べが見ていたより弱い**（実測）:

- `PATH=/usr/bin:/bin`（`bun` を含まない）で `tsukumo` 相当（`bun bin/tsukumo`）を起こしても
  **正常に起動した**。Bun は `bun run` 相当で起こした入口の子プロセスに
  `/private/tmp/bun-node-<hash>`（`bun` と `node` が Bun 自身を指す symlink）を PATH の先頭に足す。
  **拡張子の無い `bin/tsukumo` がこの扱いになる**
- 一方、素の `.ts` を `bun <file>` で起こすと足されず、`execFile("bun", ...)` は
  `Executable not found in $PATH: "bun"` で落ちる。**Node から起こした場合も同じく落ちる**
- つまりいまの `bun build` は「PATH の `bun`」ではなく「**自分を動かしている Bun**」で走っている。
  **Node へ寄せる判断をすると、この足場が消えて本物の `bun` が PATH に要るようになる**ので、
  ランタイムの選択と事前ビルドの判断は一緒に決まる

### `~/.claude/` のユーザー設定を読まないようにする

`query()` に `settingSources: []` を渡せば切れる。ただし**プロジェクトの `CLAUDE.md` とスキルも
一緒に消える**（SDK の型定義に「Must include `'project'` to load CLAUDE.md files」とある）。
人格の二重掛けを避けるだけなら `applyNeutralOutputStyle`（セッション限りの上書き）で足りているので、
切るなら別の理由が要る。

### 同梱物の解き方（`import.meta.url` 基準）

`bundledFilePath` 1つに集約してあるので、配布形を変えるときに触るのはここだけで済む。
1ファイルに固める形にするなら、同梱物を埋め込むか隣に置くかの判断がこの関数の中に入る。

### `orca` コマンド

差し替えるのは `Host.showView` の実装1つ（`src/core/host.ts` のポートは操作が1つしかない）。
何に替えるかは `docs/research/app-shell.md` の比較表が持つ。

## 下調べ（2026-09-15）との差分

**訂正**:

- 下調べ1「`claude` 本体（Agent SDK が子プロセスで起こす）」は、**PATH の `claude` ではない**。
  SDK の optional dependency として降りてくる `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`
  を起こしている。PATH にも 2.1.272 が入っているが**使っていない**
- 下調べ1「`~/.claude/settings.json` の `outputStyle` を読む」は向きが逆。tsukumo は読まず、
  `applyNeutralOutputStyle` で**セッション限りに上書きしている**。ただし設定一式そのものは
  `settingSources` を渡していないため claude 側が読む（表1の3行目）
- 下調べ3「`bun` が PATH にあること」は正確ではない。Bun が自分自身を子に渡すので、PATH に無くても
  いまの起動経路では動く（上の実測）

**足りなかったもの**（下調べの6系統に無く、今回の網で出たもの）:

- Anthropic への通信とログイン状態
- サーバ側の npm 依存（SDK・`ws`・`zod`）と、ブラウザ側だけが使う依存との区別
- `vendor/` を「自分の設置場所」に混ぜず独立した系統として数えること
- 表示先のブラウザと `127.0.0.1` のポート
- 起動先（cwd）そのもの
- `~/.bun/bin/tsukumo` の symlink
- 開発と検証のときだけ要るもの（手元の Chrome・開発ツール）

**6系統 → 19系統**（表1が12、表2が4、表3が3）。

## 数え漏れを防ぐために使った網

| 網                    | 当たった場所                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `homedir`             | `src/core/remembered-character.ts` の1箇所だけ                                                                      |
| `process.env`         | `src/cli.ts` の `readConfig(process.env)` 1回と、読み取りを集約した `src/core/config.ts`（環境変数は5つ）           |
| `execFile` / `spawn`  | `src/core/orca-host.ts` と `src/core/bundle.ts` の2ファイルだけ（`spawn` と `node:child_process` の他の利用は無い） |
| `import.meta`         | `src/core/bundled-path.ts` と `src/core/fake-driver.ts` の2箇所                                                     |
| `process.cwd`         | `src/cli.ts` の7箇所（`core` には無く、必ず引数で渡っている）                                                       |
| `package.json` の依存 | `dependencies` 11件 / `devDependencies` 10件。**optional で降りてくるネイティブバイナリが下調べに無かった**         |
| `vendor/` の中身      | 3ファイル（`highlight.min.js` と `idiomorph.min.js` は移行の段6で消えている）                                       |

**網の外で追加で確かめたこと**:

- `src` 全体の `http(s)://` は `src/core/server.ts` の `127.0.0.1` を組み立てる1件だけ
- `src/ui/style/*.css` に外部の `url(...)` も web フォントも無い（`--font-sans: system-ui` /
  `--font-mono: ui-monospace`）。**表示時の外部通信はゼロ**という `vendor/README.md` の前提は保たれている
- `/assets/` が配るのはメモリ上のビルド成果物で、ディスクの `assets/logo.png` は配信経路に無い
  （`src/core/server.ts` の `ASSET_PATH_PREFIX`）
