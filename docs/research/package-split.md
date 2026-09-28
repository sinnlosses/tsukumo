# browser と server をパッケージに割るかの検討（2026-09-28）

**この文書は調査メモであって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには
作らない。**ファイルを動かすのはこの文書の外**で、ここは割る・割らないの推奨と、割る目安までを持つ。

**問いの出どころ**: ユーザーの言葉（2026-09-27）。t3code（https://github.com/pingdotgg/t3code/tree/main/apps）
のようにブラウザ側とサーバ側を `package.json` ごとに分ける（pnpm workspace）ことについて
「分けるほうが良さそうな印象を持ったけどどうかな?」。

**実測値は時間が経つと変わる。** 数は 2026-09-28 にこの作業ツリー（`45a06ac2`）で測ったもの。
t3code は手元に無い（`ghq list` に無し）ので、`gh api` で `pingdotgg/t3code` の `d15210c`
（2026-09-27）のファイルを直接読んだ。以下で t3code について書くことはすべてその版のファイルが出典で、
記憶や解説記事で補ったところは無い。

## 結論

**割らない（据え置き）。** 1つの `package.json` のまま、層をディレクトリで表し、辺を
`test/architecture.test.ts` で落とす形（`docs/architecture/adr/0019-layer-as-directory.md`）を続ける。

一番の理由: **t3code が割っている理由（1つの契約を読むアプリが5つあり、サーバを npm へ公開して配る）が
tsukumo には無く、割って得られる検査は今のテストの検査のごく一部で、残りは割ったあとも同じテストが要る。**
代わりに払うのは、同梱物の置き場所の解き方（`bundledFilePath` がリポジトリの根から `characters/`・
`node_modules/<vendor>`・Vite を読む）の作り直し、`pnpm link --global` の打ち直し（人の手）、
docs に 1,830 箇所ある `src/server|browser|shared` のパスの書き換えで、どれも「キャラクターと一緒に楽しく
仕事をする」には効かない。

| 案                                                                    | 推奨                   | 1行の理由                                                                                                                                  |
| --------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A. 据え置き（1パッケージ＋`test/architecture.test.ts`）               | **採る**               | 外部パッケージの import はすでに層ごとに分かれていて、辺の検査はパッケージより細かい                                                       |
| B. 据え置き＋層ごとの型検査（`tsconfig` を層で割る。パッケージは1つ） | 穴が問題になったら採る | ブラウザ側から `node:` の型を外せる（実測で今のコードはそのまま通る）。サーバ側から DOM を外すと Agent SDK の型1件が落ちる                 |
| C. `apps/server`・`apps/browser`・`packages/shared` の pnpm workspace | 採らない               | 足す検査は「宣言していない依存を解決できない」だけで、同梱物・Vite・vendor の読み先が package の境界をまたぐ                               |
| D. C に加えてサーバの機能ごとに `packages/*`（t3code の形をなぞる）   | 採らない               | t3code でもサーバの機能は `apps/server/src/<機能>/` のディレクトリで、`packages/*` は読み手が2つ以上ある契約と独立したプロトコルの実装だけ |

## 測ったこと

- `package.json` はルートの1つで、`pnpm-workspace.yaml` は無い。`src/` の `.ts`/`.tsx` は `shared` 73・
  `server` 108・`browser` 232 ファイルと、直下の配線6ファイル（`cli.ts`・`main.ts` など）。計 48,576 行
- **外部パッケージの import はすでに層ごとに分かれている**（`grep` で `from "<名前>"` を層ごとに数えた）

  | 層        | import している外部パッケージ                                                                                                                                                  |
  | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `shared`  | zod・`@orpc/contract`・remeda（これ以外は `test/architecture.test.ts` が落とす）                                                                                               |
  | `server`  | `@anthropic-ai/claude-agent-sdk`・`@orpc/server`・ws・zod・remeda。`--dev` のときだけ `import("vite")`                                                                         |
  | `browser` | react・react-dom・`@orpc/client`・`@orpc/tanstack-query`・`@tanstack/react-query`・zustand・clsx・lucide-react・react-markdown・remark/rehype の7つ・unist/mdast の2つ・remeda |

  mermaid・chart.js・highlight.js はブラウザ側が import しない。サーバの
  `src/server/view-server/adapter/vendor-asset.ts` が `node_modules/` から読んで `/vendor/` で配る
  （`docs/architecture/adr/0012-bundle-vendor-library.md`）。つまりこの3つは「ブラウザで動くがサーバが読む」依存

- `src/server/adapter/bundled-path.ts` の `bundledFilePath` が、自分の3つ上（リポジトリの根）を基準に
  `characters/`・`node_modules/mermaid` など・`vite.config.ts`・`node_modules/vite/bin/vite.js`・
  `dist/browser/`・`src/browser`・`src/shared` を解く。ブラウザ側の組み立て（`pnpm run build`）も
  サーバの `src/server/view-server/adapter/bundle.ts` が Vite の CLI を子プロセスで起こす形
- `assets/` は README の画像（`logo.png` など）だけで、実行時には読まない
- `test/architecture.test.ts` は 1,825 行。層の辺（相対 import）のほかに、サーバの機能どうしの辺と循環・
  SDK を import してよいファイル（`sdk-` で始まるもの）・`@orpc/server`・`node:child_process`・
  `process.env`・`Temporal.Now` を触ってよいファイル・`shared` が読んでよい外部パッケージ・
  `browser` の箱と機能の辺まで見ている
- **いまの検査の穴**: `browser` から `node:` や `ws` を import しても落とす行が無い（`browser/utils/` を
  除く）。`tsconfig.json` は1つで、全層に `lib: DOM` と `types: ["node"]` が掛かっている
- 層ごとの型検査を試した（スクラッチに `tsconfig` を2つ置いて `tsc --noEmit -p`。リポジトリは変えていない）

  | 試した設定                                                                  | 結果                                                                                                                                                     | 時間（実時間） |
  | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------: |
  | 今の `tsc --noEmit`（全体）                                                 | 通る                                                                                                                                                     |         1.5 秒 |
  | `browser`＋`shared`＋`src/types/`、`types: []`（node の型なし）             | **通る**                                                                                                                                                 |         0.9 秒 |
  | `server`＋`shared`＋直下の配線＋`src/types/`、`lib: ["ESNext"]`（DOM なし） | 1件落ちる: `@modelcontextprotocol/sdk` の `transport.d.ts` が `HeadersInit` を探す（Agent SDK の依存。`tsconfig.json` は `skipLibCheck` を掛けていない） |         1.3 秒 |

- 単体テスト（`pnpm run test`）は実時間 36 秒。型検査は 1.5 秒で、割って並べても `check` はほぼ縮まない
- docs・`CLAUDE.md`・`README.md` に `src/server` `src/browser` `src/shared` の文字列が 1,830 箇所、
  `src/`・`test/`・`scripts/`・`story/` に 637 箇所ある（割ればこれが全部書き換わる）

## t3code の割り方

| 項目                | t3code（`d15210c`）                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workspace           | `pnpm-workspace.yaml` の `packages:` が `apps/*`・`infra/*`・`oxlint-plugin-t3code`・`packages/*`・`scripts`。版の揃えは `catalog:`、上書きは `overrides`                                                                                                                    |
| `apps/*`            | `desktop`・`marketing`・`mobile`・`server`・`web` の5つ                                                                                                                                                                                                                      |
| `packages/*`        | `client-runtime`・`contracts`・`effect-acp`・`effect-codex-app-server`・`shared`・`ssh`・`tailscale` の7つ                                                                                                                                                                   |
| 共有パッケージの形  | `@t3tools/contracts` と `@t3tools/shared` は組み立てずに `exports` で `./src/*.ts` を直接指す（`"types"` と `"import"` が同じ `.ts`）。`shared` の `exports` はファイルごとに約80本                                                                                          |
| 読み手の数          | `@t3tools/contracts` を `server`・`web`・`client-runtime`・`shared`・`ssh` が読み、`client-runtime` は `web` とモバイル向けに分けてある                                                                                                                                      |
| サーバの配り方      | `apps/server` のパッケージ名は `t3` で `bin: { t3: "./dist/bin.mjs" }`・`files: ["dist"]`。組み立て（`scripts/cli.ts build`）は `@t3tools/web#build` に依存し、**`apps/web/dist` をリポジトリの根からのパスで `apps/server/dist/client` へ写す**。単体の実行ファイルにもする |
| サーバの機能        | `apps/server/src/` の下のディレクトリ（`provider`・`orchestration`・`git`・`terminal`・`persistence` など約30）。**パッケージにはしていない**                                                                                                                                |
| `packages/*` の残り | `effect-acp`・`effect-codex-app-server`・`ssh`・`tailscale` は外のプロトコルを Effect で包んだ独立の実装                                                                                                                                                                     |
| 設定の数            | ルートに `tsconfig.base.json`・`vite.config.ts`、`apps/server`・`apps/web`・`packages/contracts` などそれぞれに `package.json`・`tsconfig.json`（`apps/*` は `vite.config.ts` も）                                                                                           |

**t3code が割っている理由は「読み手が多い」ことと「配る」こと**で、層の辺を守るためではない。
その t3code でも、組み立て済みのブラウザ側をサーバへ渡すところはパッケージの境界をパスでまたいでいる。

## 前回の「必要になったら分ける」は当たるか

`docs/research/architecture-rethink.md`（2026-09-13）の構成の行は「ワークスペース（`packages/`）にする
ほどの規模ではまだ無い。必要になったら分ける」で、**何が「必要」かは書いていなかった**。同じ文書が
挙げた症状「層をまたぐ型の複製（共有パッケージが無いことの裏返し）」は、その後 `src/shared/` を
両側が import する形になって消えている（`docs/architecture.md`「層と依存の向き」で `shared` は
`packages/shared` / `contracts` の位置と書いてある）。つまり共有パッケージが解くはずだった問題は、
パッケージにせずに解けた。規模は 15,000 行から 48,600 行に増えたが、読み手（アプリ）は今も
サーバ1つ・ブラウザ1つのままで、配り方も `pnpm link --global` のまま。**今は当たらない。**
当たる条件は下の「いつ分けるか」に具体的に書く。

## 比較

| 項目                                                   | A. 据え置き                                                                                                            | B. 据え置き＋層ごとの型検査                                                                                  | C. `apps/server`・`apps/browser`・`packages/shared`                                                                                                                                                                                                                             | D. C＋サーバの機能を `packages/*`                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 依存の宣言が層ごとに分かれるか                         | 分かれない（ルートの1つに混ざる）。ただし import は層ごとに分かれていて、`shared` の外部パッケージはテストが縛っている | A と同じ                                                                                                     | 分かれる。ただし mermaid・chart.js・highlight.js は「読むのはサーバ・動くのはブラウザ」なので、`apps/server` に置くと層の宣言として嘘になり、`apps/browser` に置くとサーバが他のパッケージの `node_modules` を読む。Vite もサーバが起こすので `apps/server` にも要る            | C と同じ。機能ごとの `package.json` が16個増え、どれも zod・remeda を宣言する                          |
| 層の辺をパッケージ境界で守れるか（今のテストと比べて） | 今のテストが相対 import の辺・機能の辺・触ってよいファイルまで見る。`browser` → `node:`・`ws` だけが穴                 | 穴のうち型の側（`browser` に node の型が無い）が塞がる。`ws` の import はテスト1行で塞ぐ                     | 塞がるのは「宣言していない依存を解決できない」ことだけ。**相対 import で他のパッケージのディレクトリへ入るのは止まらない**（止めるには TS の project references を `composite` にするか lint が要る）。機能の辺・`sdk-` の縛り・`core → adapter` は割ったあとも今のテストが要る | 機能の辺の一部がパッケージの依存に移るが、`core`/`adapter` の2段は機能の中なので残り、テストは減らない |
| `pnpm run build`                                       | 今のまま（`scripts/build-ui.ts` → サーバの `bundle.ts` → Vite の CLI）                                                 | 今のまま                                                                                                     | `pnpm --filter browser build` に移る。起動時の「成果物が古い」判定（`bundle.ts` が `src/browser` と `src/shared` の新しさを見る）の読み先が `apps/browser/src`・`packages/shared/src` に変わる                                                                                  | C と同じ                                                                                               |
| `pnpm run check`                                       | 今のまま（5段を順に。単体テスト 36 秒）                                                                                | `typecheck` が `tsc -p` 2〜3本になる（計っておおむね同じ時間）                                               | `pnpm -r typecheck`・`pnpm -r test` に割れ、`scripts/check.ts` の段の数え方が変わる。型検査は 1.5 秒なので並べても縮まない                                                                                                                                                      | パッケージの数だけ段が増える                                                                           |
| E2E                                                    | 今のまま（`test:e2e` が build してから `vitest.e2e.config.ts`）                                                        | 今のまま                                                                                                     | サーバとブラウザの両方を使うので、どちらのパッケージにも属さない。ルートか `apps/server` に置き、build を先に呼ぶ                                                                                                                                                               | C と同じ                                                                                               |
| `bin/tsukumo`                                          | 今のまま（`import "../src/cli.ts"`）                                                                                   | 今のまま                                                                                                     | `apps/server/bin/tsukumo` へ移る。配線（`src/cli.ts` など）は `apps/server` 側                                                                                                                                                                                                  | C と同じ                                                                                               |
| `pnpm link --global`                                   | 今のまま（本体の作業ツリーの直下で1回）                                                                                | 今のまま                                                                                                     | **打ち直しが要る**（直下で `unlink` して `apps/server` で `link`）。ホームに触る手順なので人の手（`docs/requirements.md` 4.6 も書き換え）                                                                                                                                       | C と同じ                                                                                               |
| `tsconfig` / Vite / Vitest の設定の数                  | `tsconfig` 2（本体・Storybook）、Vite 1、Vitest 2（単体・E2E）、`package.json` 1                                       | `tsconfig` 4〜5（土台・browser・server・Storybook、`test`/`scripts` 用）、Vite 1、Vitest 2、`package.json` 1 | `tsconfig` 5以上（土台・3パッケージ・Storybook）、Vite 1（`apps/browser` へ）、Vitest 4（3パッケージ＋E2E。または root の `projects` 1つ）、`package.json` 4、`pnpm-workspace.yaml` 1。`scripts/` と `test/` の置き場も決め直す                                                 | 機能の数（16）だけ `package.json` と `tsconfig` が増える                                               |
| 同梱パック（`characters/`・`assets/`）の解き方         | 今のまま（`bundledFilePath` がリポジトリの根から解く）                                                                 | 今のまま                                                                                                     | `bundledFilePath` の基準が `apps/server/src/...` からの深さに変わる。`characters/` を根に残すなら `apps/server` がパッケージの外を読み、`apps/server` へ移すならキャラクターの素材がサーバのコードの中に入る。`assets/` は README の画像だけなので影響なし                      | C と同じ                                                                                               |
| 移す量                                                 | 0                                                                                                                      | `tsconfig` の追加と `typecheck` の1行                                                                        | `src/` 全体の `git mv`、`test/` の振り分け、docs の 1,830 箇所と コードの 637 箇所のパス、`.gitignore`・`scripts/`・Storybook の設定                                                                                                                                            | C より多い                                                                                             |
| 依存・外部コマンドの追加                               | 無い                                                                                                                   | 無い                                                                                                         | 無い（pnpm はすでに使っている）                                                                                                                                                                                                                                                 | 無い                                                                                                   |

## 解くべき論点への答え

### パッケージ境界が今の検査に何を足し、何を失うか

**足すもの**は2つで、どちらも小さい。

1. **依存の宣言の分離**: pnpm の既定の `node_modules` では、パッケージが宣言していない依存は解決できない。
   `browser` から `ws` を import したら組み立てで落ちる。ただし今、層ごとの import はすでに分かれていて、
   割れていないのは `package.json` の見た目だけ。しかも一番目立つ vendor の3つ（mermaid・chart.js・
   highlight.js）は層に素直に割れない
2. **型検査の分割**: ブラウザ側から node の型を、サーバ側から DOM の型を外せる。これは**パッケージを割らずに
   `tsconfig` を層ごとに割るだけで得られる**（案 B。実測でブラウザ側は今のコードのまま通る）

**足さないもの**: 相対 import でパッケージのディレクトリをまたぐのは、パッケージにしただけでは止まらない。
機能どうしの辺・`core → adapter` の禁止・SDK や `child_process` を触ってよいファイルは、割ったあとも
`test/architecture.test.ts` が持つ。テストの 1,825 行のうち、パッケージの境界に置き換わるのは層の辺の
2本（`src/ の相対 import は、許した辺…`・`shared と core は node: / SDK / ws に触らない`）の一部だけ。

**失うもの**: 設定ファイルが3〜4倍になる（上の表）。`bundledFilePath` が「リポジトリの根」を1つの基準に
できなくなり、`characters/`・vendor・Vite・成果物の読み先がパッケージをまたぐ。`pnpm link --global` を
人の手で打ち直す。docs とコメントのパスが約2,500箇所動き、`node scripts/find-stray-reference.ts` と
節の参照の検査を通し直す。

### 共有の語彙（`src/shared`）を独立したパッケージにするか

**割るなら独立したパッケージ（`packages/shared`）にする。どちらかに寄せる形は採らない。**
`server` に寄せるとブラウザが SDK と ws を宣言したパッケージに依存することになり、`browser` に寄せると
サーバが React を宣言したパッケージに依存する。どちらも「宣言を層ごとに分ける」という割る目的に逆らう。
t3code も `@t3tools/contracts`（契約）と `@t3tools/shared`（両側の純粋な関数）を独立させ、組み立てずに
`exports` で `.ts` を直接指している。tsukumo で割るなら同じ形（`exports` を `shared/<機能>/` ごとに1本）
になり、`docs/architecture.md`「shared の機能」の `shared/<機能>/` の割り方はそのまま `exports` の単位になる。

**据え置く今は、`src/shared/` のディレクトリのままでよい。** `shared` は両側が import する契約の置き場として
すでに働いていて、読んでよい外部パッケージもテストが縛っている。

### `server` の中の機能までパッケージにするか

**しない。** t3code の `packages/*` はサーバの機能ではない。サーバの機能（`provider`・`orchestration`・
`git`・`terminal` など約30）は `apps/server/src/` の下のディレクトリで、`packages/*` に出しているのは
(1) 読み手が2つ以上のアプリにまたがる契約と純粋な関数（`contracts`・`shared`・`client-runtime`）と、
(2) 外のプロトコルを包んだ独立の実装（`effect-acp`・`effect-codex-app-server`・`ssh`・`tailscale`）だけ。
tsukumo の `src/server/<機能>/` は読み手がサーバ1つで、機能どうしの辺はすでに `SERVER_FEATURE_IMPORTS`
の表で縛っているので、t3code と同じ基準でもディレクトリのままが対応する。

## いつ分けるか

次のどれか1つに当たったら、この文書の案 C を測り直す。**1つ目と2つ目が t3code が割っている理由**で、
当たったらほぼ割る。3つ目と4つ目は、まず案 B やテストの1行で済むかを先に見る。

1. **契約を読むアプリが2つ目のサーバ以外に増えた**: Electron・モバイル・別のクライアント（例:
   `docs/research/app-shell.md` の Electron 化、`docs/research/mobile-orca-reach.md`）を始めて、
   `shared` を読む入口がブラウザ1つでなくなったとき
2. **`pnpm link --global` 以外の配り方をする**: npm へ公開する・単体の実行ファイルにする・他の人の
   マシンへ入れる（対象ユーザーが作者本人だけ、という `docs/requirements.md` 1章の前提が変わる）とき。
   このときは同梱物の読み先を「組み立ての成果物の中」へ移す作業が要り、パッケージの境界と一緒に決める
3. **層ごとに同じ依存の違う版が要る**: 例えばブラウザ側の React やサーバ側の SDK が、もう一方の層の
   依存と版で衝突し、1つの `package.json` で解けなくなったとき
4. **検査の穴で実害が出た**: `browser` から `node:`・`ws` を import して、組み立てか実行で初めて気づいた、
   ということが起きたとき。まず案 B（`tsconfig` を層で割る）とテストの1行で塞ぎ、それで足りなければ割る

## 据え置いたまま埋められる穴

今の検査の穴（`browser` → `node:`・`ws`）は、割らずに塞げる。やるなら別のタスクで、次の2つのどちらか。

- `test/architecture.test.ts` の「shared と core は node: / SDK / ws に触らない」に `browser` を足す
  （`browser` は `node:`・`ws` を import しない。SDK は別の行がすでに落としている）
- 案 B: `tsconfig` を層で割り、ブラウザ側に `types: []` を掛ける。サーバ側から DOM を外すのは、
  Agent SDK の依存（`@modelcontextprotocol/sdk`）の型が `HeadersInit` を探すので、ここだけ別の手当てが要る

## 参照

- t3code（`d15210cd3da79f9a1a495a6309d912d76362a046`、2026-09-27）を `gh api repos/pingdotgg/t3code/contents/<パス>` で読んだ:
  `pnpm-workspace.yaml`・`package.json`・`apps/server/package.json`・`apps/server/vite.config.ts`・
  `apps/server/scripts/cli.ts`（`apps/web/dist` を `dist/client` へ写す箇所）・`apps/web/package.json`・
  `packages/contracts/package.json`・`packages/shared/package.json`・`packages/client-runtime/package.json`・
  `packages/effect-acp/package.json`・`packages/ssh/package.json`・`apps/server/src/` のディレクトリ一覧
- `docs/research/architecture-rethink.md`「言語・ランタイム・エコシステム」の構成の行
- `docs/architecture/adr/0019-layer-as-directory.md`・`docs/architecture/adr/0012-bundle-vendor-library.md`
- `src/server/adapter/bundled-path.ts`・`src/server/view-server/adapter/bundle.ts`・`src/server/view-server/adapter/vendor-asset.ts`・`test/architecture.test.ts`
