# アーキテクチャ詳細: 全体像と層

ステータス: **正典**。入口は `docs/architecture.md`（全体構造の入口と、子のファイルの一覧）。

責務: 全体構成の前置き（1つのプロセス・データの流れ3本・外へ出る経路を作らないこと・層の図）と、層と依存の向きを持つ。
読む時: 層（shared / server / browser）や `core` と `adapter` の辺を確かめたいとき。
直す時: 層の分け方・層どうしの import の規則を変えたとき。

## 全体構成

tsukumo は**1つのプロセス**で、Agent SDK（`@anthropic-ai/claude-agent-sdk`）で Claude Code を
子プロセスとして起こし、受け取ったイベントを `shared` の型で `core` が畳み、WebSocket 1本で
`browser`（ブラウザの React の部品）へ配る。**Claude Code の TUI は開かない**ので、利用者が見るのは
tsukumo の画面だけになる。

データの流れは3本ある。

1. **入力欄 → セッションドライバ**: `<Composer>` がコマンドの手続き（`session.prompt` /
   `session.interrupt` など）を WebSocket の上で呼び、`session` の行が駆動（SDK または fake driver）へ
   渡す（「コマンドの受け手と手続きの置き方」）
2. **イベント → 各ビュー**: `assistant` のテキストはメインビューの**レポート**、`speak` の
   引数はキャラビューの**セリフと表情**、`tool_use` / `tool_result` はサイドバーの**進行**に
   なる。`applySessionEvent` で畳んだ `SessionState` を、サーバとブラウザが同じ形で持つ
   （「shared」）
3. **`canUseTool` → 答え待ち → お伺い → 回答**: 許可プロンプトと `AskUserQuestion` はどちらも
   `canUseTool` に届く。tsukumo は答え待ちの状態にして**メインビューのお伺いの札**に選択肢を出し（キャラは
   吹き出しで聞くだけ）、選ばれた答えを `canUseTool` の戻り値として SDK へ返す

**外へ出る経路は作らない。** SDK は claude を子プロセスとして起こすだけ、`speak` は tsukumo の
プロセス内の MCP サーバ（戻り値は `"ok"` だけ）、ビューは `127.0.0.1` にだけバインドする。
**会話は tsukumo のプロセスの外へ出さない**（`docs/coding-standards.md`「会話内容の扱い」）。

実際の画面はメインビュー・キャラビュー・サイドバー・入力欄の4領域が**1枚のページ**に入る
（`docs/requirements.md` 4.7 が正典）。

```
browser（React。状態 = shared の SessionState、reducer はサーバと同じ物）
   ▲ ServerFrame（hello の snapshot / events）      │ コマンドの手続き（oRPC）
   │        WebSocket 1本（127.0.0.1、起動トークン付き）▼
server/<機能>/core（純粋な判断。外の世界に触らない）
   ▲ 呼ばれる                                      │ core を import する
server/<機能>/adapter（外の世界に触る場所。1ファイル = 1境界。SDK は sdk-* のファイル群）
   ▲ SDKMessage                                    │ query / interrupt / canUseTool
Claude Code（SDK が起こす子プロセス）

shared（語彙・イベント・状態・reducer・zod スキーマ）は browser と core の両方が import する。
辺は adapter ──▶ core ──▶ shared ◀── browser（core → adapter は禁止。結ぶのは src/ 直下と src/wiring/ の配線だけ）
```

### 層と依存の向き

**この形は「共有コントラクト＋クライアント/サーバ分割」**。`shared` は TypeScript のモノレポでいう
`packages/shared` / `contracts` の位置（サーバとブラウザの両方が import する契約）、`browser` は
クライアント、`core` と `adapter` はサーバで、「どちらの実行環境で動くか」で分けている。
**サーバ側だけをもう一段、「純粋な判断（`core`）」と「外の世界に触る境界（`adapter`）」に割り**、
その割りは**機能の中**に置く（`server/<機能>/core/` と `server/<機能>/adapter/`。どの機能にも属さない
共有のものだけを `server/core/` と `server/adapter/` の直下に残す）。**`core` と `adapter` という名前は
どの深さでも層だけを表す。** 比べた案は `docs/research/architecture-proposal.md` /
`docs/history/architecture-placement.md` / `docs/history/decision.md`「design.md 2. 全体構成 /
ディレクトリ（`src/server/` を機能で割った）」。

**層はパッケージ（pnpm workspace）には割らない。** `package.json` は1つのまま、層をディレクトリで表す。
パッケージの境界が足す検査は「宣言していない依存を解決できない」ことだけで、辺の検査は割っても
`test/architecture/` が要るため。比べた案と、割る目安は `docs/research/package-split.md`。

| 層               | 置くもの                                                                                                                                               | import してよい先                                       | 実行場所         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------- |
| `shared`         | 概念の語彙・`SessionEvent`・`SessionState`・`applySessionEvent`・コマンドとフレームの zod・手続きの契約。**`SessionState` から純粋に導けるもの**も含む | `shared` のみ（`zod`・`@orpc/contract`・`remeda` は可） | サーバとブラウザ |
| `server/core`    | サーバ側の純粋な判断。セッション管理・駆動の契約・イベントの検証・ポートの決定・設定の解釈。**`server/<機能>/core/` と、共有の `server/core/`**        | `shared` / `core`                                       | サーバ（Node）   |
| `server/adapter` | 外の世界に触る場所。SDK・WebSocket・HTTP・ホスト・ファイル・子プロセス・fake driver。**`server/<機能>/adapter/` と、共有の `server/adapter/`**         | `shared` / `core` / `adapter`                           | サーバ（Node）   |
| `browser`        | React の部品・hooks・CSS・Markdown の変換                                                                                                              | `shared`（React などの npm は可）                       | ブラウザ         |
| `src/` 直下      | 配線（composition root。`cli.ts` / `main.ts` と起動の段取り。機能ごとの組み立ての `src/wiring/` を含む）                                               | すべて                                                  | サーバ           |

- **`core` と `browser` は互いを import しない。** 両者が知っているのは `shared` だけ
- **`core → adapter` は禁止。** 辺は `adapter ──▶ core ──▶ shared ◀── browser` の一方通行で、
  `core` と `adapter` を結ぶのは `src/` 直下と `src/wiring/` の配線だけ。**機能をまたいでも同じ**で、どの機能の
  `core/` もどの機能の `adapter/` も import しない（層は機能より先に効く）。**`core` は `node:` / SDK（`@anthropic-ai/*`）/
  `ws` を import しない**ので、`core` から外の世界へ出る道は無い
- **`adapter` は1ファイル = 1つの境界。** インターフェースは切らない（実装が2つあるもの —
  駆動とホスト — だけ、契約の型を `core` に置く: `server/session-driver/core/session-driver.ts` /
  `server/host/core/host.ts`）
- **`shared` は `node:` も `document` も触らない。** 好みではなく**物理的な制約**で、`shared` は
  サーバとブラウザの両方で読み込まれるので、片方にしか無い API に触れた時点でもう片方で動かなくなる
- 許した辺以外は `test/architecture/layer.test.ts` が落とす（層の辺は上の4本。サーバ側の機能どうしの辺は
  次の節の表）。import の拾い方は構文木で、静的 import・`export … from`・動的 `import()`・`require()` の
  specifier を引用符の違いに関係なく拾う。`shared` と `core` が外の世界（`node:` と `node:` なしの組み込み・`ws`・
  `@anthropic-ai/*`）を読む道も同じ拾い方で塞ぐ。`process.env`・`process.cwd` を読む形のうち、`process.env`・分割代入・`process["env"]` は
  `.oxlintrc.json` の `no-restricted-properties` が、`import { env } from "node:process"` は `no-restricted-imports` が `src/**` で見て、
  許すファイルは同じ `overrides` に並べる（許す分だけを引いた同じ規則を書き直す）。
  `node:os`・`node:http` 系・Agent SDK の import も `no-restricted-imports` が見る（`require()` は `src` に使い手が無いので見ない）。
  `process` を別名で import する形はこの規則が拾えないので、`test/architecture/outside-world.test.ts` が見る。
  同じテストが見るのは、ほかに起こす外部コマンドと `listen` の宛先、
  `writeFileSync` を取り込めるファイルの許可リスト（テキストは `server/adapter/lib/atomic-file.ts` の `writeFileAtomic` に任せ、
  画像・排他作成の錠だけが許可リストに入る）
