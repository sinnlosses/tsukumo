# 設計書

最終更新: 2026-09-27。ステータス: **正典**。

**このファイルの役割は、コードを1ファイル読んでも分からない構造の規則だけを持つこと**
（層と機能の辺・置き場所の基準・プロトコルの不変条件・動きの順序・安全の境界）。ほかは持ち主へ返す:

| 種類                                 | 返す先                                                 |
| ------------------------------------ | ------------------------------------------------------ |
| コードの写し                         | **削除**（`docs/history/` へ移さない）                 |
| 機能の仕様                           | `docs/chat-mode.md` / `docs/requirements.md`           |
| 経緯と実測                           | `docs/history/`                                        |
| 「なぜこの形か」で残す価値があるもの | `docs/architecture.md`「設計判断（なぜ今の形なのか）」 |

**13章「画面のデザイン」は `docs/screen-design.md` へ移した**（節の番号 `13.x` はそのまま）。
この設計書の中でファイル名を添えずに `13.6` のように書いた番号は、そちらの節を指す。

## このドキュメントの読み方

### このファイルは通読しない

節を1つ特定して、その節だけを次の形で読む:

```bash
sed -n '/^## 4\. shared/,/^## /p' docs/design.md
```

**このファイルには「いまどうなっているか」だけを書く。** 却下した案の理由・値の根拠の実測・
覆した決定の記録は `docs/history/` に置き、ここからは1行で参照する。何を残して何を移すかの表は
`docs/requirements.md`「正典に残すもの・`docs/history/` へ移すもの」。

### 節の索引

**索引の行は本文の `## <番号>.` の章と1対1**（`###` の節は載せない。章を足したり消したりしたら、
ここも同じ数だけ動かす）。**1章は欠番**（旧「何を変え、何を残すか」。いまも効く決定は
`docs/architecture.md`「設計判断」へ、移行前後の対照表は `docs/history/decision.md` へ移した）。

| 節                             | 中身                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ## 2. 全体構成                 | 層（shared / server / browser）の図、依存の向き、サーバの機能と辺、コマンドの受け手、ディレクトリ、`components/ui/` の部品、ブラウザ側の置き場所の基準 |
| ## 3. 動きの流れ               | 起動・接続・依頼・答え待ち・再接続の順序                                                                                                               |
| ## 4. shared                   | **両側が共有する契約**。イベント・状態・コマンド・フレーム・版                                                                                         |
| ## 5. core と adapter          | 判断（core）と境界（adapter）の境目、SDK に触るファイルの分け方、代の持ち物、ツールで受け取るものと使い捨ての `query()` の形                           |
| ## 6. browser                  | 状態の持ち方、Markdown、重いライブラリ、立ち絵の動き、CSS（6.1 は欠番）                                                                                |
| ## 7. キャラクターパック       | パックの形・探索順・`systemPrompt` の append の並び、画面から書くときの安全の境界、一覧と素材の URL、雑談の記憶の置き場（仕様は `docs/chat-mode.md`）  |
| ## 8. セッションの復元と複数化 | 復元を新しい形に載せる。複数化をやらないこと                                                                                                           |
| ## 9. 会話内容と安全           | `127.0.0.1`・Origin・起動トークン・ディスクに書く3つの例外と読み戻す口・定着・ブラウザ側のメモリ                                                       |
| ## 10. テスト                  | 対象ごとの方法、**E2E（走らせ方・成果物・シナリオ）**、E2E に任せないもの                                                                              |
| ## 11. ビルドと依存            | 事前の組み立て、作り直しを押す仕組み、**足す依存の一覧（承認済み）**                                                                                   |

## 2. 全体構成

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
辺は adapter ──▶ core ──▶ shared ◀── browser（core → adapter は禁止。結ぶのは src/ 直下の配線だけ）
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

| 層               | 置くもの                                                                                                                                                                                                                                                                                        | import してよい先                                       | 実行場所         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------- |
| `shared`         | 概念の語彙・`SessionEvent`・`SessionState`・`applySessionEvent`・コマンドとフレームの zod・手続きの契約。**`SessionState` から純粋に導けるもの**も含む（ブラウザしか読まないものを含む。`main-view.ts` `turn-step.ts` `turn-speech.ts` `portrait-motion.ts` `room.ts` `command-suggestion.ts`） | `shared` のみ（`zod`・`@orpc/contract`・`remeda` は可） | サーバとブラウザ |
| `server/core`    | サーバ側の純粋な判断。セッション管理・駆動の契約・イベントの検証・ポートの決定・設定の解釈。**`server/<機能>/core/` と、共有の `server/core/`**                                                                                                                                                 | `shared` / `core`                                       | サーバ（Bun）    |
| `server/adapter` | 外の世界に触る場所。SDK・WebSocket・HTTP・ホスト・ファイル・子プロセス・fake driver。**`server/<機能>/adapter/` と、共有の `server/adapter/`**                                                                                                                                                  | `shared` / `core` / `adapter`                           | サーバ（Bun）    |
| `browser`        | React の部品・hooks・CSS・Markdown の変換                                                                                                                                                                                                                                                       | `shared`（React などの npm は可）                       | ブラウザ         |
| `src/` 直下      | 配線（composition root。`cli.ts` / `main.ts` と起動の段取り）                                                                                                                                                                                                                                   | すべて                                                  | サーバ           |

- **`core` と `browser` は互いを import しない。** 両者が知っているのは `shared` だけ
- **`core → adapter` は禁止。** 辺は `adapter ──▶ core ──▶ shared ◀── browser` の一方通行で、
  `core` と `adapter` を結ぶのは `src/` 直下の配線だけ。**機能をまたいでも同じ**で、どの機能の
  `core/` もどの機能の `adapter/` も import しない（層は機能より先に効く）。**`core` は `node:` / SDK（`@anthropic-ai/*`）/
  `ws` を import しない**ので、`core` から外の世界へ出る道は無い
- **`adapter` は1ファイル = 1つの境界。** インターフェースは切らない（実装が2つあるもの —
  駆動とホスト — だけ、契約の型を `core` に置く: `server/session-driver/core/session-driver.ts` /
  `server/host/core/host.ts`）
- **`shared` は `node:` も `document` も触らない。** 好みではなく**物理的な制約**で、`shared` は
  サーバとブラウザの両方で読み込まれるので、片方にしか無い API に触れた時点でもう片方で動かなくなる
- 許した辺以外は `test/architecture.test.ts` が落とす（層の辺は上の4本。サーバ側の機能どうしの辺は
  次の節の表）

### サーバの機能と、機能どうしの辺

`src/server/` は**機能のまとまりで割り、機能の中を層（`core/` と `adapter/`）で割る**。機能の名前は
`docs/glossary.md` の語（単数形）で、**1つの機能 = 1つのディレクトリ**。機能の中は `core/`（判断）と
`adapter/`（境界）の2段だけで、中身の無い段は作らない。

| 機能              | 何の機能か                                                                                   | `core/`                                                                                                                                                  | `adapter/`                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `session/`        | セッションを持つ・起こす・頼む。**各機能の判断を束ねる**（下の「束ねる機能」）               | `session-manager` `session-launch` `event-batch` `driver-command` `command-session` `session-command`                                                    | `remembered-default`                                                                     |
| `session-driver/` | セッション駆動。契約・SDK の実装・fake driver・メッセージの変換・答え待ち・続きから始める    | `session-driver` `sdk-message` `pending-answer` `self-started-turn` `visible-output-nudge` `session-restore` `session-title` `prompt-image-shelf` `plan` | `sdk-driver` `sdk-tool` `sdk-session` `sdk-context-usage` `fake-driver` `claude-account` |
| `report/`         | レポートの記法・`report` ツール・検査と差し戻し・塊の使われ方の記録                          | `report-notation` `report-tool` `report-review` `report-violation` `report-usage`                                                                        | `report-usage-log`                                                                       |
| `system-prompt/`  | `systemPrompt` の append の組み立てと、セリフの間合いの規約                                  | `system-prompt` `speech-cadence`                                                                                                                         | —                                                                                        |
| `chat/`           | 雑談モード。作法・記憶・話しかけ・アーカイブ・要約・覚えたこと・定着                         | `chat-manner` `chat-memory-prompt` `chat-nudge` `chat-archive-entry` `chat-episode-score` `chat-consolidation` `chat-consolidation-writer` `chat-recall` | `chat-archive` `chat-summary` `persona-memory` `sdk-chat-consolidation`                  |
| `character-pack/` | キャラクターパックの選択・読み込み・画面からの編集                                           | `character-selection`                                                                                                                                    | `character-pack` `character-edit`                                                        |
| `visit/`          | 訪問。契機・来客・台本・見張り                                                               | `visit-timing` `visit-guest` `visit-script` `visit-script-writer` `visit-watch`                                                                          | `sdk-visit-script` `visit-clock`                                                         |
| `diary/`          | 日記。`diary` ツールと保存                                                                   | `diary-tool` `diary-writer`                                                                                                                              | `diary` `sdk-diary`                                                                      |
| `achievement/`    | 成果。`main` の履歴から数える                                                                | `achievement`                                                                                                                                            | `main-history`                                                                           |
| `usage-review/`   | 見直し。2つのツール・前回の結果・見送り                                                      | `usage-review-tool`                                                                                                                                      | `previous-usage-review` `usage-proposal-dismissal`                                       |
| `token-usage/`    | トークン消費の記録と集計                                                                     | `token-usage`                                                                                                                                            | `token-usage-log`                                                                        |
| `context-usage/`  | コンテキストの内訳の記録                                                                     | `context-usage`                                                                                                                                          | `context-usage-log`                                                                      |
| `host/`           | ホストのポートと Orca の実装、ホストへ渡す前の門番                                           | `host` `tracked-file`                                                                                                                                    | `orca-host`                                                                              |
| `view-server/`    | ビューサーバ。ポートの決定・http・ws・同梱の外部ライブラリ・ブラウザ側の組み立てと開発サーバ | `port-resolution`                                                                                                                                        | `server` `session-socket` `vendor-asset` `bundle` `ui-dev-server` `source-fingerprint`   |
| `repository/`     | 作業ディレクトリの git リポジトリを読む。`git` を起こす口・管理下のファイル・タスク一覧      | —                                                                                                                                                        | `git` `repository-file` `task-summary`                                                   |

**どの機能にも属さない共有のもの**は、`server/core/` と `server/adapter/` の**直下**に置く
（`core/config.ts`、`adapter/tsukumo-home.ts` `bundled-path.ts` `local-time.ts` と
`adapter/lib/json-file.ts` `jsonl.ts`）。置いてよいのは**どの機能の語彙も名乗らず、読み手が
2つ以上ある（機能・共有の箱・配線のどれでも数える）もの**だけで、読み手が1つの機能だけに
なったらその機能へ下ろす（`browser/domain/` と同じ引き金）。

**機能どうしの import の規則**:

- **層の規則が先に効く。** `core/` は、どの機能のものでも `adapter/` を import しない
- **機能 A が機能 B を import してよいのは、下の表にある組だけ。** 共有の箱はどの機能からも
  読んでよく、**共有の箱は機能を読まない**
- **層ごとに循環させない。** 機能の `core/` どうしの辺と、機能の `adapter/` どうしの辺は、それぞれ
  一方通行（表はその順に並ぶ）。機能の単位で見ると輪が2つある（`chat` ↔ `session-driver` と、
  `view-server` → `session` → `session-driver` → `view-server`）が、どちらも1本が
  `adapter → 別の機能の core` で層の辺と同じ向きなので、ファイルの単位では輪にならない
- **束ねる機能は `session/` の1つ。** `session-manager.ts` は外の世界に触らないので `core` だが、
  各機能の判断（訪問の見張り・日記・トークン消費・雑談のアーカイブ）を読んで1つのセッションに
  まとめる。**外の世界の実装を選んで渡すのは配線（`src/` 直下の `session-start.ts` など）**、
  渡されたものを使って順序と状態を持つのが `session/`、という境目
- **Agent SDK を import してよいのは、機能の `adapter/` の直下の `sdk-` で始まるファイルだけ**
  （原則3）。1つの箱にはまとめず、**その境界が属する機能に置く**（5章）
- **機能を足すときは、検査の機能の一覧と下の表に足す**（知らない機能のディレクトリと、
  `core/` `adapter/` の外に置いたファイルは `test/architecture.test.ts` が落とす）

| 機能（import する側） | 読んでよい機能                                                                                  | いまある辺の層                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`             | `session-driver` `chat` `visit` `diary` `token-usage` `context-usage` `character-pack` `report` | core → core だけ（`session-manager` → `report-usage`）                                                                                                  |
| `system-prompt`       | `session-driver` `chat` `report`                                                                | core → core だけ                                                                                                                                        |
| `view-server`         | `session` `achievement`                                                                         | adapter → core（`session-socket` / `rpc-guard` → `command-session`）・adapter → adapter（`server` → `main-history`）                                    |
| `chat`                | `session-driver` `character-pack`                                                               | core → core と adapter → core（駆動の契約にある雑談の型）・adapter → adapter（`persona-memory` / `chat-summary` → `character-pack` / `character-edit`） |
| `context-usage`       | `session-driver`                                                                                | core → core（駆動の契約）                                                                                                                               |
| `session-driver`      | `chat` `report` `usage-review` `view-server`                                                    | core → core（`report-review` `port-resolution`）・adapter → core（各ツールの判断）                                                                      |
| `diary`               | `character-pack` `repository` `session-driver`                                                  | adapter → adapter・adapter → core（`sdk-diary` → `session-driver/core/sdk-message.ts` の `tsukumoToolFullName`）                                        |
| `achievement`         | `repository`                                                                                    | adapter → adapter（`main-history` → `git`）                                                                                                             |
| そのほか              | —（葉。`report` `visit` `usage-review` `token-usage` `character-pack` `host` `repository`）     | —                                                                                                                                                       |

#### コマンドの受け手と手続きの置き方

**「どのコマンドをどの機能が受け、どの条件で断るか」を、契約と機能の側の表から辿れるようにする。**
画面からのコマンドは `/ws`、読み取りは HTTP の `/rpc` の oRPC の手続き（比較は `docs/research/server-procedure-proposal.md`）。

**辿り方**: `src/router.ts` で名前を探す → `shared/contract/<機能>.ts`（形と断る条件の `meta`）→
`<機能>/adapter/<機能>-procedure.ts`（委ね先）→ `<機能>/core/`（コマンドなら `<機能>-command.ts` の
行）。**どのコマンドでも同じ4段**。

| 置くもの                                        | 場所                                            |
| ----------------------------------------------- | ----------------------------------------------- |
| 契約（形・**断る条件の `meta`**）               | `src/shared/contract/<機能>.ts`                 |
| 機能の表（コマンドだけ）                        | `src/server/<機能>/core/<機能>-command.ts`      |
| 行の型と、葉の行を呼ぶ関数                      | `src/server/core/command-receiver.ts`           |
| 手続き（`implement(contract.<機能>)` の受け手） | `src/server/<機能>/adapter/<機能>-procedure.ts` |
| 照合と断る条件のミドルウェア                    | `src/server/view-server/adapter/rpc-guard.ts`   |

- **断る条件は契約の `meta` に書く**（行には持たない。二重に持たない）。形は
  `{ chatOnly: false | 理由, idleTurn: false | 理由 }`（`src/shared/command.ts` の `CommandMeta`）で、
  理由は `FRAME_ERROR_REASON`（`shared/frame.ts`）の値。**条件と理由を同じ所に書く**。断ったときは
  理由を添えた `REFUSED` が応答で返り、受け手は呼ばれない
- **受け手は3種**（`write` / `call` / `session` の判別可能な合併型。`command-receiver.ts`）。`session` の
  受け手は `CommandSession`（`command-session.ts`）を受け取り、**`session` の表にだけ書ける**（型が
  `session/core/` にあるので、葉の機能からは物理的に書けない）。書き込み口は各機能の `ports` にあり、
  中身を選ぶのは `src/session-start.ts`
- **束ねるのを配線に置く理由**: 表を `session/core/` で束ねると、`session` が `usage-review` と
  `host` を読む辺（いまの表に無い）が要り、`session` がまた全部を知る場所に戻る。配線なら
  **機能どうしの辺の表は増えない**。葉の機能の表と手続きが読むのは `shared` と共有の `core`
  （`command-receiver.ts`）と自分の機能だけ
- **押し出しも手続き**（購読 `frame.subscribe`）。`/ws` の上は**すべて oRPC の手続きの要求と応答**で、
  `hello` / `events` / `refresh` のフレームは Event Iterator で届く。購読の元を**取りこぼさず・捨てずに**
  写し、接続が切れたら購読を外す。購読には照合（`rpcGuard`）だけを掛け、断る条件は見ない
- ブラウザは型付きの client（`src/browser/stores/session.ts` の `dispatch`）で呼ぶ。**送りっぱなしで、
  断られても画面には出さない**（画面は同じ条件で先に操作子を塞いでいる）

`/prompt-image/<id>`（`<img src>` で読む）と静的な配信は HTTP の経路のまま。

**許す依存の辺**（`test/architecture.test.ts` が見る）:

| 辺                                    | 許す場所                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `shared` → 外部                       | `zod` と `@orpc/contract`（`@orpc/server`・`node:` は読まない）。手続きより前から読んでいる `remeda` も可               |
| `@orpc/server` を import してよい場所 | 機能の `adapter/`（`view-server/adapter/` を含む）と配線（`src/router.ts`）だけ。**`core` と共有の箱は禁止**            |
| `browser` → 外部                      | `@orpc/client`（`/rpc` は `@orpc/client/fetch`、`/ws` は `@orpc/client/websocket`）と `@orpc/tanstack-query`            |
| `src/router.ts`（配線）               | すべての機能の `<機能>-procedure.ts` と、口の型のための `<機能>-command.ts`。配線なので**機能どうしの辺の表は増えない** |
| 機能どうしの辺                        | 上の表のまま（受け手が別の機能の判断を要るようになったら、今と同じく表に足す）                                          |

### ディレクトリ

```
src/                          配線（composition root）。cli.ts（入口）・main.ts（起動の段取り）・
                              router.ts（全機能の手続きを束ねる）ほか、起動と接続を進める数ファイル
  types/                      どの層にも属さない ambient 宣言（import されない *.d.ts）だけを置く
  shared/                     契約・イベント・状態・reducer・zod スキーマ（両側が読む語彙。層の直下に平置き）
    contract/<機能>.ts        手続きの契約（形・断る条件の meta）
  server/
    core/ adapter/            どの機能にも属さない共有の判断・境界
    <機能>/core/ adapter/     機能の判断・境界（上の「サーバの機能と、機能どうしの辺」）
  browser/                    React の部品・hooks・CSS（下の「`src/browser/` の箱と、置く基準」）
test/                         src/<相対パス>.ts → test/<相対パス>.test.ts
characters/<name>/            character.json・persona.md・素材
```

**ファイル名は概念で、単数形**（原則5）。`helpers/` と `common/` は作らない。**ディレクトリ名に単数形の
縛りは無く**、`src/browser/` の置き場所のディレクトリ（`components/`（とその下の `page/` `domain/` `ui/`）
`features/` `hooks/` `domain/` `lib/` `utils/` `stores/` `styles/` `types/`）は bullet-proof-react の名前を
そのまま採る（`components/` の下の3つは利用者の Next.js の雛形の名前）。機能・領域の名前は用語集の語に、
画面の名前は `stores/location-hash.ts` の `Screen` の値に合わせる。**手本から採るのはディレクトリの形だけ**で、
kebab-case のファイル名・barrel file を作らない・`@/` を使わない相対 import はそのまま（PascalCase・
1部品1フォルダは真似しない）。**例外は `components/ui/` と、ページの `components/` の2つだけ**で、
部品と CSS の対が平たく並ぶと見づらいので部品ごとに `<部品>/<部品>.tsx`・`<部品>.module.css` の
1フォルダへ分ける（例外の中でも `index.tsx` は置かない。`docs/coding-standards.md`「barrel file を作らない」）。
**実体が無い箱は先に作らない**（手本の `app/` `api/` `config/` `assets/` `testing/` などは作らない。
理由は `docs/history/decision.md`「design.md 2. 全体構成 / ディレクトリ（採らなかった bullet-proof-react の要素）」）。
ファイルを移すときは、パスを指す記述が `.module.css` のコメントにもあるので `grep -rn` の対象から外さない。

**ページの形**（`components/page/<ページ>/`）:

```
components/page/<ページ>/
  <ページ>.tsx                   container（入口。components/app/layout.tsx が置く）。名前は Screen の値
  presentational-<ページ>.tsx    presenter（器）
  <ページ>.module.css            container / presenter と、2つ以上の部品が読む CSS（あれば）
  domain/ hooks/                 そのページだけの語彙・フック（container / presenter も読むもの）
  components/                    そのページの部品。直下はディレクトリだけ
    hooks/                       components/ の下の2つ以上の部品だけが読むフック
    <部品>/                      1部品1ディレクトリ
      <部品>.tsx                 部品（割るなら container）。外から引くのはこのファイルだけ
      presentational-<部品>.tsx  割るときの presenter
      <部品>.module.css          この部品（と中の子部品）だけが読む CSS
      hooks/ domain/             この部品（と中の子部品）だけのフック・語彙
      components/<子部品>/       この部品だけが使う子部品。ページの components/ の直下の部品だけが持てる
      <概念>/                    下の「機能の中を分ける」の概念のディレクトリ（markdown/ など）
```

- **ページの直下は、container / presenter の対と `<ページ>.module.css`、`domain/` `hooks/` `components/`
  だけ。** 対は**どのページも必ず1対**にする（入口の形が決まっていれば、開く前に中の見当が付き、検査で
  名前を決め打ちできる）。container が state か副作用を持つなら `hooks/use-<ページ>.ts` へ出す。
  **2つ目の画面**（ページの中で並ぶか重なるもの）は直下に置かず `components/<部品>/` の部品にする。
  ファイル名の `-screen` は付けない
- **置き場所は「読み手すべてを含む、いちばん近い箱」で機械的に決める**（部品・フック・語彙・
  CSS のどれも同じ）。数えるのは `import`（`import type` も含む）で、テストは数えない:

  | 読み手                                               | 置き場                                                                                               |
  | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
  | ページの直下（対・`hooks/`・`domain/`）を1つでも含む | ページの `hooks/` / `domain/` / `components/<部品>/`                                                 |
  | `components/` の下の2つ以上の部品（直下は含まない）  | フックは `components/hooks/`、語彙はページの `domain/`、部品は `components/<部品>/`                  |
  | `components/<部品>/` の中だけ（その部品と子部品）    | その部品の中の `hooks/` / `domain/` / `components/<子部品>/`                                         |
  | 2つ以上のページ・枠                                  | ページの外（部品なら `components/domain/`、フックは `browser/hooks/`、それ以外は `browser/domain/`） |

  **入れ子はページの `components/` から2段まで**（子部品だけが使う孫は、親の部品の `components/` に
  子部品と並べる）。CSS はファイル単位で読み手を数え、クラスごとには割らない

- **部品のディレクトリの外から引いてよいのは `<部品>.tsx` だけ**（例外は `main.tsx` / `app.tsx` /
  `components/app/` とテスト）。ページの部品を画面の外に置くとき（書き終わりの知らせ `DiaryNotice`）は、
  `components/app/layout.tsx` がその `<部品>.tsx` を直に import する
- 会話の画面は**1ページ**で、4つの領域は `conversation/components/` の下の部品。検査は
  `test/architecture.test.ts`（`describe("components/page/ の形", …)`）

**`src/browser/` の箱と、置く基準**（判断に迷ったら「その機能しか読まないなら機能の中」が既定。
領域も同じ）:

| 箱                     | 置くもの                                                                                                  | import してよい先                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `main.tsx` / `app.tsx` | 入口（`main.tsx` は mount だけ）と `<App>`（`app.tsx`。Provider を重ねて `<Root>` を描く）                | すべて                                                                                                                              |
| `components/app/`      | **`<Root>` と、出す画面を選ぶ `<Layout>`**。すべての画面を知る composition root                           | `components/page` / `components/domain` / `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared` |
| `components/page/`     | **画面**。1つの画面（会話の画面は1つの領域）に閉じた部品・状態・保存                                      | `components/domain` / `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                     |
| `components/domain/`   | **tsukumo の語彙を持つ部品**。直下は2つ以上の領域が読む部品、サブディレクトリは全画面で共有する枠（領域） | `components/ui` / `features` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                                           |
| `features/`            | **置かれる機能**（置き場所を持たず、領域に置いてもらう機能の部品・状態）                                  | `components/ui` / `hooks` / `domain` / `lib` / `utils` / `stores` / `shared`                                                        |
| `components/ui/`       | **語彙を持たない** React の部品（値と呼び先を全部受け取る）                                               | `components/ui` / `hooks` / `lib` / `utils` / `shared`                                                                              |
| `hooks/`               | **語彙を持たない** React のフック（`use-modal-dialog.ts`）                                                | `lib` / `utils` / `shared`                                                                                                          |
| `domain/`              | **画面全体の語彙**（tsukumo の語彙を名乗り、複数の領域・機能が読むもの。部品ではないもの）                | `lib` / `utils` / `shared`                                                                                                          |
| `lib/`                 | **ライブラリを包む**道具（React の部品ではないもの）                                                      | `utils` / `shared`                                                                                                                  |
| `utils/`               | **ライブラリに依存しない**汎用の道具（下の「`lib/` と `utils/` に置く基準」）                             | —（`utils` の中だけ）                                                                                                               |
| `stores/`              | **画面全体で共有する状態**の store・Context と、それを読む hook                                           | `lib` / `utils` / `shared`                                                                                                          |
| `styles/`              | **グローバルな CSS だけ**（`theme.css`。領域・機能の見た目はその中）                                      | —                                                                                                                                   |

- **部品の箱の向きは `app.tsx` → `components/app` → `components/page` → `components/domain` → `features` →
  `components/ui` の一方通行**。`components/domain` は画面を知らず、`features/` は自分を置く枠も画面も
  知らず、`components/ui` は tsukumo の語彙を知らない。**画面の組み立てを `components/domain/` へ移さない**
  （枠が画面を import する逆向きの辺になるので、`page` より上の段 `components/app/` に置く）
- **`components/domain` と `components/ui` の線は、tsukumo の語彙を持つかで引く**（`Portrait` は `domain`、
  `Select`・`Button`・`ImageZoom` は `ui`）
- **`stores/` は「状態ライブラリの置き場」ではなく「画面全体で共有する状態の置き場」**（6.2）。置くのは
  **複数の領域が読む**状態で、領域の中に置けず、`app.tsx` に残すと領域が入口を import することになる
  ので箱が要る。**1本の hash の書き方は `stores/location-hash.ts` だけが知る**。領域と機能が触れるのは
  `stores/` が公開する hook までで、`app.tsx` と `stores/` の中身を組み立てる側として import しない
- **領域どうし・機能どうしは import しない**（唯一の例外が「領域 → 置かれる機能」の1方向。次の節。
  親が子を組む形も数える）。またいで要るものは、**語彙を持つ部品なら `components/domain/`、フックなら
  `hooks/`、状態なら `stores/`、それ以外は tsukumo の語彙を名乗るなら `domain/`、ライブラリを包む道具なら
  `lib/` へ上げる**。上げる引き金は「2つ目の読み手が出たとき」で、1つの領域しか読まないものは領域の中に残す
- **引き金は逆にも引く。** 読み手が1つの領域だけに戻ったら、その中へ**下ろす**。`browser/lib/` と
  `browser/domain/`、`components/domain/` の直下に「1つの領域（機能）だけが読むファイル」が無いことは
  `test/architecture.test.ts` が見る（どの領域・機能も読まないものは対象外）
- **`domain/` と `lib/` の線は、包んでいる技術の有無では引かない。** 引くのは「**ファイル名が tsukumo の
  語彙を名乗るか**」。`domain/appearance-color.ts` は `localStorage` を包むが名前が指すのは**画面の色**なので
  `domain/`、`lib/tool-summary.ts` は純関数だが名前が指すのは**外部システムの語彙**（Claude Code の
  ツール）なので `lib/`
- 検査は `test/architecture.test.ts`（領域と置かれる機能の一覧が横の辺を、箱の一覧が縦の辺を落とす）

### `components/ui/` の部品（variant の作法と一覧）

**語彙を持たない部品は、見た目の違いを variant（props の文字列リテラルの合併型）で表し**、呼び出しを
読めば見た目が分かる形にする。**部品が持つ見た目は `theme.css` のトークンと、ここで決めた段だけ。**
置くかどうかは**tsukumo の語彙を持たないか**だけで決め、読み手の数は問わない（「引き金は逆にも引く」の
検査は掛けない）。**`components/ui/` はストアを読めない**。

- **variant 部品**（`Text` / `Heading` / `Stack`（と `VStack` / `HStack`）/ `Button` / `Dialog`）は見た目を
  部品が持つ。**形だけの部品**（`Select`）は寸法・枠・地・字の段を呼び出し側が `className` で渡し、
  **variant を持たない**（プルダウンは置き場所ごとに寸法がまるで違う）
- **1つの prop が1つの軸**。1つの property に写る軸は**値の名前をトークン名そのままにする**
  （`size: "secondary"` → `--font-secondary`）。**複数の property の束（ボタンの顔）は、使っている
  組み合わせごとに1つの値にする**（軸を掛け合わせると CSS の無い組み合わせが型の上で選べてしまう）
- 合併型 → class の対応表は **`satisfies Record<合併型, string | undefined>` で全域を検査する**。
  値 `"inherit"` は class を付けない。**props はすべて必須**（既定値を持たず、呼び出しを読めば見た目が
  全部分かる）。**値を足すのは使う箇所が出たときだけ**で、トークンに無い値が要るなら先に
  `docs/screen-design.md` の段を直す
- **上書きは `className` の1つ**。**部品の CSS で `:where()` の外に書いた property は部品のもの**で、
  呼び出し側は同じ property を書かない。呼び出し側に譲る既定（`margin: 0` など）は `:where()` の中に書く
  （詳細度0なので読み込み順に関係なく呼び出し側が勝つ。`theme.css` が要素の選択子で書く property は
  入れない）。呼び出し側が渡すのは**置き方**と**語彙に無い見た目**だけ。**`className` に渡すのは
  `styles["…"]` の字面だけ**で、重なりは `test/architecture.test.ts`「components/ui/ の部品の className」が見る
- **画面固有の値を持つもの（`--usage-*`・`--diary-gold-*`）は部品を使わず、機能の CSS のまま残す**
  （部品の語彙と画面の語彙が1つの要素の上で競る）。**段に乗らない値も丸めない**——部品に置き換えても
  画面の見た目は変えないのが既定で、丸めると決めたら変わる画面を目視で確かめる
- **汎用の `as` は持たない**（`href` のような要素固有の属性が型から外れる）。要素を選ぶのは閉じた合併型の
  prop（`Heading` の `level`・`Stack` の `element`）だけ。`Stack` は `data-*` とイベントの口を持たない
- **Text と Heading の境目**: 見出しの意味（`level`）と見た目（`size`）を別の props にする。対応表は
  `ui/text/` の1つを読む（二重に持たない）。`<h*>` でない「見出しに見える字」は `Heading` にしない
- **`VStack` / `HStack`** は向きの決まった並べで、向きを値で切り替える箇所だけ `Stack` を直接使う
- **`Button`**: 押せないは **`aria-disabled` の1通り**。**押せる行・押せる文字**（タスクの ID・件数の
  チップ・暦の日・吹き出しのように、中身そのものを押すもの）は `Button` にしない
- **札（Badge / Chip）・`<details>`・地の段を持つ箱（Card / Surface）は部品にしない**（箱の値が置き場所
  ごとに違い、値を全部 `className` で渡すことになる。1つずつの理由は `docs/history/decision.md`
  「design.md 2. 全体構成 / `components/ui/` の部品（採らなかった部品）」）
- テストは `test/browser/components/ui/<部品>/<部品>.test.tsx` で、variant の値 → 付く class・描く要素・
  振る舞いまで。**色や寸法が効いているか（絵）は守らない**（置き換えのたびに目視で確かめる）

### 領域の機能と、置かれる機能

画面を組み立てる部品のまとまりは3種類ある。**まとまりどうしの辺は「枠・画面 → 置かれる機能」と
「画面 → 枠」だけ**を許し、それ以外は落とす。

| 種類                       | どういうものか                                                       | 置き場                    | 辺                                                                                                         | いまの中身                                                   |
| -------------------------- | -------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **枠**（frame）            | 全画面で共有する枠。差し込み口は props で受け、画面を知らない        | `components/domain/<枠>/` | 画面と `<Layout>` から import してよい。**枠どうしは import しない**                                       | `screen-nav` / `sidebar`                                     |
| **画面**（screen）         | 1つの画面 = 1つのページ。**どの画面を出すかを決めるのは `<Layout>`** | `components/page/<画面>/` | `<Layout>` だけが import する。**画面どうしは import しない**                                              | `conversation` / `character` / `token-usage` / `achievement` |
| **置かれる機能**（placed） | 自分の置き場所を持たず、枠か画面の中に置いてもらう                   | `features/<機能>/`        | 枠・画面から import してよい。**自分はどの機能も、枠・画面も、`components/domain` も import しない（葉）** | `task-board`                                                 |

- **`components/domain/` の直下のファイルは領域ではなく共有の部品**。**直下にサブディレクトリを足す
  ときは枠として一覧に載せる**（載せ忘れは検査が `throw` する。どの一覧にも無いディレクトリが
  `features/` と `components/domain/` の直下、`components/page/` の下にあれば落ちる）
- **どの画面にも出るが、1つの画面と語彙を共有するものは、その画面の中に置く**（書き終わりの知らせは
  成果の画面と見開きを開く合図と鈴の絵を共有する）。どこに出すかは `<Root>` が決める
- **「置かれる機能」にするのは、中身が領域の持ち物でなくなったとき**（`task-board` はサイドバーの
  一覧と画面いっぱいの `<dialog>` の対で、どちらも**タスクの語彙**で書かれている）。置かれる機能の側は
  「サイドバー」も「区画」も名乗らず、置き場所を知らないまま書く。語彙を持たない `components/ui/` とは別物
- **区画ひとまとまりは領域の側に置く。** 枠・見出しの文言・押せる口・購読・state を1ファイルにまとめて
  領域の中に置き（`components/domain/sidebar/task-section.tsx`）、置かれる機能からは「何を描くか」だけを
  import する。**購読と state を区画が持つ**ので、描き直しはその区画で止まる（`<Root>` へ上げると
  タスクが変わるたびに全領域が描き直される）

### 機能の中を分ける（container / presenter と `hooks/`）

**この節の「機能」は、枠・画面・置かれる機能のすべてを指す。** ページでは、この節の割り方をページの
中の部品に1つずつ掛け（ページの入口だけはいつも対）、置き場は「機能の直下」を「読み手すべてを含む、
いちばん近い箱」に読み替える。1つの機能に container が複数あってよい（`dispatch` の `composer` /
`pending-answer` / `turn-status`）。

**割るかどうかは、部品が抱えている「振る舞いの種類」の数で決める。行数もフックの本数も数えない。**

| 種類                   | どういうものか                                                                       | 例                                                        |
| ---------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **保つ**（state）      | `useState` / `useRef` で持ち、イベントで遷移する                                     | 開いているか・下書き・選んだ位置                          |
| **外と同期**（副作用） | `useEffect`・タイマー・`<dialog>` の DOM・取得（`useQuery`）・DOM の出来事の読み替え | 1秒ごとの刻み・`showModal()`・`git ls-files` の一覧の取得 |
| **畳む**（算出）       | 受け取った値を**画面に出す形**へ変える                                               | 経過秒 → 「1分05秒」・並びの反転・候補の絞り込み          |

**ストアを読むだけは数えない**（「props で降ろす代わりに自分で読む」だけで、部品の中身は増えない。6.2）。
**2種類以上そろったら割り、1種類までは1ファイルのままにする**（2種類そろうと、片方を読むためにもう片方を
読み飛ばすことになる）。**割り方は「余分な種類を外へ出す」方向で決める**:

| 抱えているもの                                         | 割り方                                                                | 例                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| 3種類そろっている                                      | container / `hooks/use-<名前>.ts` / `presentational-<名前>.tsx` の3つ | `task-board` / `chat-view`                                    |
| **外の世界に触るフックだけ**が余分                     | そのフックだけを `hooks/use-<概念>.ts` へ出し、残りは1ファイルのまま  | `main-view.tsx` → `main-view/hooks/use-active-turn-scroll.ts` |
| **純関数だけ**が余分で、**フックを呼ばない相手**が読む | `domain/<概念>.ts` へ出す                                             | `task-board/domain/task-status.ts`                            |

3つに割るときの分担:

| ファイル                    | 持つもの                                                                          | 持たないもの                       |
| --------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| `<名前>.tsx`（container）   | フックを呼び、**戻り値を展開して渡す**（presenter の Props はフックの戻り値の型） | JSX の中身・算出・条件分岐         |
| `hooks/use-<名前>.ts`       | state・副作用・イベントの読み替え。**画面に出す形の値と呼び先を返す**             | JSX                                |
| `presentational-<名前>.tsx` | 器だけ。受け取ったものを `components/` に渡す                                     | **フックを1つも持たない**・算出    |
| `components/*.tsx`          | 部品ひとつずつ。class を付けて値を置く                                            | 算出・判定（**畳んだ値で受ける**） |
| `domain/*.ts`               | **フックに入れられない**機能固有の語彙（対応表・文言）                            | JSX・フック・React                 |

- **部品に算出を残さない。** フックが畳んでから渡し、部品に残ってよいのは**class を選ぶ分岐だけ**
- **純関数でも、まず `hooks/use-<名前>.ts` に入らないかを見る**（呼ぶのがそのフック1つならフックの下に
  置く）。**`domain/` を切るのは、フックを呼ばない相手が読み、その機能固有の語彙で名乗れるものだけ**
  （フックに置くと、フックを使わない側が `use-*.ts` を import することになる）。フックでない純関数は
  `hooks/` に置かない
- **`presentational-` の接頭辞は、この形のときだけ付けてよい**（`CLAUDE.md` 原則5 の例外。**container と
  1対1で対になっている**ことがファイル名で分かるため）。**フックと presenter の名前は container の名前に
  合わせる**（機能名で名乗ると対が分からなくなる）。**1ファイル1フック**
- **機能の中の `hooks/` に置くのは、その機能だけが読むフック**（container と対になっていないフックは
  **その概念**の名前）。読み手が2つになったら `browser/hooks/` へ上げる
- 語彙を持たない汎用の部品は、読み手が1つでも `components/ui/` に置く。**描き直しを止める `memo` は
  presenter 側に残す**（container はフックのぶん毎回描き直される）

**機能の中に、概念の名前のサブディレクトリ（`main-view/markdown/`）を置いてよい。** 切るのは
**ファイルが3つ以上でその概念だけで閉じている**・**`hooks/` `components/` `domain/` のどれか1つに
収まらない**・**名前がその機能の中の概念**の3つがそろったときだけで、そろったら `hooks/` などより優先する
（その概念だけが読むフックも中に入れ、中では接頭辞を落とす）。2つ目の読み手を得たらディレクトリごと上げる
（演出の `reveal/` は `browser/domain/reveal/`）。

**機能の中の `components/` はストアを読んでよい**が、**2つそろったときだけ**: (1) props で降ろす道に
`memo` か、その事情を知らない部品が挟まっている（降ろすと `memo` の前提が崩れ、黙って描き直しが増える。
`task-run-confirm.tsx`）、(2) 読んだ値で分けるのは class と文面だけ。どちらかを満たさないなら、
ストアを読む側を container へ出す。

### `lib/` と `utils/` に置く基準

**どの層の中にも `lib/` と `utils/` を作ってよい。** どちらも層の中で「tsukumo の語彙を名乗らない道具」を
分ける箱で、**層をまたぐ import の可否は変わらない**（`lib/` に入れても `core → adapter` は禁止のまま）。
判定は**ファイル名が指している概念1つ**で決める（原則5）:

1. **tsukumo の語彙**（`docs/glossary.md` に載る語）なら、どちらにも置かない。`shared` は層の直下、
   サーバ側は機能の `core/` か `adapter/` の直下、`browser` は `browser/domain/`。領域・機能の中の
   ものは、**その領域（機能）しか読まないならその中に残す**（名前が形式を指していても）
2. 残ったものを、**言語の標準か、その外か**で分ける:

| ファイル名が指しているもの                                                             | 箱       | 例                                                                                       |
| -------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| **ライブラリを包む道具**（外部パッケージ・実行環境の API・外部システムとファイル形式） | `lib/`   | `browser/lib/socket.ts`（WebSocket）・`browser/lib/data-url.ts`（`FileReader`）          |
| **ライブラリに依存しない汎用の道具**（言語の標準だけで書けるもの）                     | `utils/` | `browser/utils/clock.ts`（`Temporal`）・`browser/utils/format-count.ts` / `day-label.ts` |

実行環境の API（DOM・`node:fs` など）は**その実行環境でしか動かない**点でライブラリの側。`Temporal` は
言語の標準なので `utils/` に置ける。React の hook を使う `browser/lib/debounce.ts` は手法の名前でも `lib/`。
**「複数箇所から呼ばれる」はどちらにも置く理由にならない。**

**`utils/` の歯止め**（3つとも満たすものだけ置ける）:

1. **import が同じ `utils/` の中だけ**（外部パッケージ・`node:`・`shared/` の型を引いたら `utils/` ではない）
2. **ファイル名が動詞か、名前の付いた手法**（`string.ts` `format.ts` のような型・種類の名前と `misc.ts` は置けない）
3. **別のプロジェクトへ1文字も変えずにコピーして意味が通る**

**`helpers/` と `common/`、ファイル名の `utils.ts` / `helpers.ts` / `common.ts` は作らない**（判定の問いを
持たず、何を置いてよいかが決まらない）。

- `adapter/lib/` は**境界を名乗らず、技術の扱い方だけを知っている道具**
  （「JSONL を1行ずつ読む」）で、読み手が1つの機能だけならその機能の `adapter/lib/`、2つ以上なら共有の
  `server/adapter/lib/`
- `core/lib/` に入れてよいのは **`node:` を要求しない技術**だけ。`shared/lib/` は**両方の実行環境で動く技術**だけ
- **`src/browser/utils/` の辺は `test/architecture.test.ts` が見る**（箱の辺と歯止め1）。他の層に `utils/` を
  作るときも、同じ検査を足す。**ライブラリに依存しない小物は、`utils/` を作る前に remeda（11章）にあるかを見る**

## 3. 動きの流れ

### 起動

1. `cli.ts` が `config.ts` で環境変数を読み、`main.ts` の `run(config, launch)` を呼ぶ（`launch` は引数の `--dev`）
2. `main.ts` が**即時終了する前提**を3つ確かめる — ポート番号として読めるか（`port-resolution.ts`）、
   組み立て済みの成果物（`dist/browser/`。11章）を読めるか（ソースのほうが新しければ、止めずに1行
   知らせる）、fake driver なら疑似セッションを読めるか
3. `current-character.ts` が初期パック（指定されたもの・覚えていたもの・既定）を決める。
   **以降このパックの持ち回りはここに閉じる**
4. `view-delivery.ts` が**起動トークン**を1つ作り、`server.ts` を `127.0.0.1` で listen させる
   （`--dev` のときは Vite の開発サーバもここで差し込む。11章「作り直しを押す仕組み」）
5. `session-start.ts` が `session-manager.ts` にセッションを1つ作る。駆動は `TSUKUMO_DRIVER` が
   `fake` なら fake driver、それ以外は SDK。復元（8章）はここで判定する。起こしたセッションは
   `view-delivery.ts` の `connect` で `/ws` に繋ぐ
6. ホストのポートで `http://127.0.0.1:<port>/?t=<token>` を開く（失敗しても続行）

**起こし直し**（`session.switchCharacter` / `session.setChatMode` / `session.switchSession`）も、駆動を
起こす一続き（`session/core/session-launch.ts` の `createSessionLaunch`）は起動時とまったく同じものを
通る。違うのは `session-manager.ts` が `generation` を1つ進めて古い駆動のイベントを捨ててから同じ
一続きをもう一度呼ぶ、という外側だけ（8章）。一続きの中の順序（パックと記憶の状態 → 続きから始めるか
→ 切り替え先の一覧 → 駆動 → 続きからなら履歴の再生）は `createSessionLaunch` が正典。

### 接続

1. ページが組み立て済みのスクリプトを読み、`<App>` が `/ws?t=<token>` へ接続して、購読の手続き
   `frame.subscribe` を呼ぶ
2. サーバは upgrade の前に Origin とトークンを確かめ、購読の最初に **`hello` フレーム**
   （`PROTOCOL_VERSION`・`SessionState` の snapshot・キャラクターの見せ方）を1つ流す
3. 以降、セッションで起きたイベントを **50〜100ms ごとにまとめた `events` フレーム**で押す。
   ブラウザは同じ `applySessionEvent` で畳む。**サーバとブラウザの `SessionState` は構造的に同じ**

### 依頼

1. Composer が手続き `session.prompt({ text, images })` を `/ws` の上で呼ぶ
2. サーバは契約の zod で検証し、断る条件（`meta`）を見てから `session` の行 → 駆動の `prompt(text)`。
   駆動が `request` イベントを起こし、それが `events` で戻ってくる（**ブラウザはローカルで
   echo しない**。ターンの開始はサーバのイベントで知る）
3. 断片（`partial-utterance`）は1バッチ内で連結して1件にする（転送量の抑制。畳み込みの結果は同じ）
4. 受け付けられないとき（検証に落ちた・断る条件に当たった・駆動が失敗を返した）は手続きの応答が
   エラーになる（断ったときは契約の `REFUSED` と定型文の理由）。**依頼の文面を含めない**

### 答え待ち

1. `canUseTool` → `pending-answer.ts` の列 → `pending-changed` イベント → 状態の `pending`
2. PendingAnswer 部品が `pending[0]` を描く。押されたら `session.answer({ id, answer })`
3. 列が解決 → `pending-changed` → 箱が消える。解決済みの id への回答は `REFUSED`

### 再接続

WebSocket が切れたらブラウザは指数バックオフで繋ぎ直し、購読し直して、**新しい `hello` の snapshot で状態を
置き換える**（差分の取りこぼしを気にしない。`lastEventId` での再開は使わない）。購読が終わった・投げた
ときも接続を閉じて同じ道で繋ぎ直す。プロセスが落ちている間は「接続が切れている」印を
Layout に出す。復帰したときにセッションを続きから起こし直す話は 8章。

## 4. shared

**zod を使うのは境界の書き込み側と封筒だけ。**
コマンドの契約の入力（`src/shared/contract/<機能>.ts`）は**全部 zod が正典**（ブラウザから届く書き込みの
経路なので厳密に見る。`text` の上限もここ）。`ServerFrame` は**封筒（`type` / `protocolVersion`）だけ** zod で、中身
（`state` / `events`）は検証しない。**`SessionEvent` と `SessionState` は zod にしない**（TS の型のまま。
状態にフィールドを1つ足すたびにスキーマを二重に直す手間のほうが効いてくるため）。
境界（WebSocket の両端）で1回だけ検証し、中では検証済みの型を使う。`shared` の中に `node:` も
`document` も持ち込まない（2章「層と依存の向き」）。

### 4.1 SessionEvent

`SessionEvent` の一覧とフィールド、各イベントの出どころは `src/shared/session-event.ts` の型定義
（`kind` ごとの doc コメント）を正典とする。ここに残すのは、コードから読み取れない決定だけ。

**イベントは時刻を持って送る**（`StampedEvent`）。`at` はサーバの時計で、reducer は
`applySessionEvent(state, event, at)`。**ブラウザ側で時計を reducer に渡さない**（両側の状態が同じに
なるように、時刻はイベントの発生側が決める）。

**`state.model` は `init` を待たずに先回りで更新する**（`/model` を送ったそのターンの `init` はまだ古い
モデルを返す）。`assistant` に乗る `local_command_run` の `args` が `MODEL_ALIASES`（4.3）と完全一致する
ときだけ更新する。**`local_command_run` を持たない古い SDK ではこの経路が黙って効かなくなり**、テストは
通ってしまうので、SDK の下限を下げるときは確かめ直す（版の実測は `docs/history/decision.md`
「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」）。`session.setModel` も同じ
`model-changed` を使い、駆動が確定を待ってから出す（駆動を経るのでローカル echo の禁止には当たらない）。

**`request` は文面だけでなく、添えた画像の控え（`images: string[]`）も運ぶ**（`docs/requirements.md`
4.10）。**原寸は載らない** — 原寸はモデルへ渡ったあとサーバのメモリの棚（`prompt-image-shelf.ts`）に
直近ぶんだけ残る。控えを作るのはブラウザ側で、**サーバは画像を加工しない**。

**`character-changed` は、いま出しているパックの姿と一緒に全パックぶんの一覧（`packs`）を運ぶ。**
**一覧だけの別のイベントにはしない**（契機が重なり、分けると片方を出し忘れたときに一覧と姿がずれる）。
ターンの中では流れない。1件の形・配り直す契機・素材の URL は 7.2。

**API の不調は3つのイベントと `turn-finished` の `outcome` で運ぶ**（`api-retry` / `api-error` /
`rate-limit-changed`、`outcome: completed | interrupted | failed(cause)`。型は `src/shared/turn-failure.ts`）。

- **`api-error` だけではターンの失敗にしない**——本体が立て直して続けることがあるので、失敗かどうかは
  `result` を写した `outcome` が決める
- `result` は API のエラーの種類を持たないので、**種類を足すのは畳み込み**（そのターンの `api-error`、
  無ければ最後の `api-retry`、どちらも無ければ `unknown`）。変換（`sdk-message.ts`）は状態を持たない
  1メッセージ1変換のまま保つ
- **中断は失敗にしない**（`error_during_execution` は、`terminal_reason` が中断か無いときは `interrupted`）
- **運ぶのは型の決まった値だけ**で、`result` の `errors` の自由文は契約に入れない（`docs/requirements.md` 4.1）

### 4.2 SessionState

`SessionState`（`src/shared/session-state.ts`）の各フィールドと理由は、その型（および
`TurnProgress` / `CharacterInfo` など内訳の型）の doc コメントを正典とする。ここに残すのは、
`SessionState` の外側にある決定だけ。

**`connection`（接続中／切断中）は `SessionState` に入れない**（サーバ側に意味が無いため）。
ブラウザだけが持つ状態で、`src/browser/stores/session.ts` の `SessionStoreState` が `SessionState` と
同じ store に相乗りさせて配る。

**畳み込みの規則は `shared` の側が持つ**（`speeches.slice(-1)`・`speechCalledInTurn`・
`MAX_SESSION_STATE_TURNS` の窓）。**記録（`SessionRecord`）を依頼の区切りでターンに割るのは
`src/shared/turn.ts` の `splitIntoTurns` だけ**で、メインビュー・ターンごとのセリフ・依頼の手順・記録の
窓はその並びの上で自分の形に変え、依頼より前の記録（`PRE_REQUEST_TURN_ID`）をどう扱うかも各所が決める。

**成果は `SessionState` に入れない。** 成果の画面の中身は、画面が開いているときにブラウザが読み取りの
手続き（`achievement.day` / `achievement.calendar`）で取りに行く（状態に入れるとどの画面でもフレームと
再接続のたびに運び、数えるのに `git` を何度も起こす）。応答の決まり:

- **応答はサーバの今日（`today`）を持つ。** 日の境目を決めるのはサーバの `local-time.ts` の1箇所で、
  ブラウザは時計を読まず、「今日」「昨日」と「次の日」を押せるかを `today` との比較で決める
- **`main` が読めないときは `{ kind: "unknown" }`（200）、数える途中の `git` の失敗は 503** で、
  部分的な数を配らない。日記が読めないのは `unreadable` として数と一緒に配る
- 入るのは数・時刻・タスクの ID と `summary`・日付と日記だけで、コミットの件名も会話の文面も
  入らない。起動トークンが要る（9章）

**経過時間**は `turn` が持つ時刻から browser が計算する（`SessionState` に秒数は入れない）。

**API の不調の持ち方**。3つに分けて持つ。消える理由がそれぞれ違うため:

- **`apiTrouble`**（`src/shared/api-trouble.ts`）は**いまのターンの中だけ**の状態。ターンの境目と、
  **モデルが何かを出したとき**（`MODEL_OUTPUT_EVENT_KINDS`）に下ろす。呼び直しが実った合図は SDK から
  来ないので、応答が届いたことを合図の代わりにする
- **`rateLimit`**（`src/shared/rate-limit.ts`）は**セッションを通した**状態で、次の
  `rate-limit-changed` が来るまで持つ（戻る時刻を過ぎても、戻ったかは次の知らせでしか分からない）
- **失敗の理由**は `turn` の `finished` の `ending`（次の依頼まで）と、記録の `turn-failure`（記録の窓から
  落ちるまで）の2か所に残す

**記録の時刻**。記録のうち**依頼（`request`）とセリフ（`speech`）の2種類だけ**が `time: RecordTime` を
持つ。読むのは雑談のログ（13.7「時刻と日の区切り」）と、キャラビューのセリフのログの依頼の区切りで、
仕事のメインビューへ渡す形（`MainViewEntry`）には載せない。

- **形は判別可能な合併型**（`RecordTime`）: `stamped` は起きた時刻が分かり、`restored` は前のセッションを
  組み直したもので時刻が分からない（`at: number | undefined` にしない）
- **時刻を打つのはサーバ**（イベントの `at` をそのまま写す）。畳み込みの中で時計は読まない（4.1）
- **ほかの種類には足さない**（雑談のログが拾わないうえ、記録を作る場所すべてに時刻の出どころが要る）
- **復元した記録の時刻は運ばない**（transcript を読む口が時刻を落として返し、アーカイブと文面で
  突き合わせると別の時刻を付けうる。間違った時刻より「分からない」を出す）
- **組み直しの終わりは `history-restored` イベントで伝え**、畳み込みはそこまでの依頼とセリフを
  `restored` に書き換える。**起こし直すと記録は空から始まる**ので、再生のイベントに打たれる `at`
  （流し直した時刻）を残すと、起こし直した直後のログが全部「いま」に見える

### 4.3 ClientCommand

**節の名前は移す前のまま**（コマンドの和 `ClientCommand` は手続きへ移して消えた）。コマンドの一覧と
入力は機能ごとの契約 `src/shared/contract/<機能>.ts`（zod。4章冒頭の決定どおりここが正典）、束は
`src/shared/rpc.ts` の `commandContract` を見る。どの機能が受けるか・断る条件は2章
「コマンドの受け手と手続きの置き方」。

- `text` の上限は `MAX_PROMPT_TEXT_LENGTH`（`src/shared/contract/session.ts`）
- `images` は**原寸と控えの対**（`PromptImage`。`src/shared/prompt-image.ts` が正典）。値そのものは
  `docs/requirements.md` 4.10 が正典。**1枚も無いのが普通**なので、field ごと省いた形も受け取って空に
  畳む。WebSocket の `maxPayload` は原寸が上限まで全部通る大きさにしてある
- `PermissionMode` と `ModelAlias` の値の一覧は **`shared`（`src/shared/command.ts`）に1つだけ
  置く**。SDK の型との一致は `core` 側のテストで守る

### 4.4 ServerFrame

`ServerFrame` の一覧とフィールドは `src/shared/frame.ts` の型定義（`type` ごとの doc コメント）を
正典とする。

- `protocolVersion` が browser の `PROTOCOL_VERSION` と違えば、browser は会話の画面の代わりに
  「ページを読み込み直してください」を出し、以降の `events` を畳まない（起こし直したプロセスと古いタブの
  組み合わせで起きる。画面だけ差し替わった道は11章の指紋で塞いだが、塞ぎ損ねたときは上げ直すまで
  直らないので、知らせにはそれも書く）。版の合う `hello` がまた届けば戻る

### 4.5 版と互換

`PROTOCOL_VERSION` は整数1つ。**イベントの追加は版を上げない**（知らない `kind` は reducer が
無視する）。既存イベントの形を変える・状態の形を変えるときだけ上げる。

## 5. core と adapter

サーバ側は機能ごとのディレクトリの中が `core/`（判断）と `adapter/`（外の世界に触る境界）に
分かれている（2章「サーバの機能と、機能どうしの辺」）。各ファイルの持ち物はそのファイルの冒頭と
doc コメントが正典で、機能の数え方・契機・上限は `docs/requirements.md`（成果と日記は 4.11、
見直しは 4.12、訪問は 4.13）。ここには、1ファイルを読んでも分からない横断の規則だけを置く。

**境目の基準は「`shared` の語彙で書けるか / SDK の語彙を名乗るか」。** 駆動の契約
（`SessionDriver` と `SessionDriverOptions`）は `session-driver/core/session-driver.ts`、SDK の実装は
`adapter/` の `sdk-` で始まるファイル。`core` の契約は何がどの順で載るかを決めずに受け取るだけに
する（`systemPrompt` の append は文字列で受け、組むのは `takeSystemPromptAppend`。7章）。
疑似セッションを流す `fake-driver.ts` も同じ契約で、`session-manager` はどちらが動いているかを知らない。

**SDK に触るファイルは、SDK のどの口に触るかで分ける**（import してよい先は
`docs/architecture.md` 原則3）。駆動の `session-driver/adapter/` に `query()`・ツール・セッションの一覧・
`/context` の内訳の4つがあり、`sdk-driver.ts` 以外を呼ぶのは駆動と配線だけ。使い捨ての `query()` は、
それを使う判断と同じ機能に置く（`sdk-visit-script.ts` / `sdk-diary.ts` / `sdk-chat-consolidation.ts`）。

**2つのファイルが共有する定数は、読む側の層で置き場を決める。** `core` と `adapter` の両方が読む
ものは `core` に置き、`adapter` がそこから取る（`TSUKUMO_MCP_SERVER_NAME` / `SPEAK_TOOL_NAME` は
`core/sdk-message.ts`。`core → adapter` は禁止なので逆には置けない）。両側と画面が読む既定値は
`shared` の1箇所（既定の effort は `BUILTIN_SESSION_DEFAULT.effort`）で、adapter は自分の定数を持たない。

**代のあいだだけ意味のある勘定は、駆動1代ぶんの持ち物（`SessionGeneration`）に集める。**
起こし直し（`restart`）はそれを丸ごと作り直すことで、勘定を1つずつ空へ戻す行を持たない
（足した勘定を `restart` へ戻し忘れても型は落とさないため）。配る束・トークンの累計・訪問の見張り・
日記の書き手は代をまたがず、コンテキストの内訳を書いた印と依頼の原寸の棚だけがまたぐ。代を
閉じたあとに届いたイベントは捨てる。

**イベントを受けて何かを記録するものは、その概念のファイルへ寄せる。** `token-usage.ts` /
`context-usage.ts` は書き口の契約と走行中の勘定を、`chat-archive-entry.ts` は「どのイベントを
アーカイブの1行にするか」を持つ。`session-manager.ts` に残るのは、どの順で・どちらの由来の
ときに呼ぶか（`origin` と `chatMode` の門）だけ。

**ツールで受け取るものは、同じ形で受ける**（`report`・見直しの2つ・`diary`）:

- **引数の検査は境界で2段**。型・列挙・整数は zod の形で SDK が先に断り（handler は呼ばれない）、
  形の外の条は `core` の窓口が断る。断るときは理由と直し方を `isError` 付きで返し、モデルが
  書いた文面は写さない。**断った呼び出しは状態を変えない**。受け付けたら `"ok"` だけを返す
  （見直しの段だけは、見送った提案の識別子を続けて返す）
- **イベントを作るのは、預かりが要るかで決める。** 差し戻しの判定が出るまで預かる `report` は
  `assistant` メッセージの変換（`sdk-message.ts`）が作る。預かりの要らない見直しと日記は、検査を
  通したときに handler が流し、変換はそのツールを知らない。handler が流したものは復元の再生に
  出てこないので、起こし直すと状態は初期値から始まる

**使い捨ての `query()`**（訪問の台本・日記・雑談の定着）は、会話の駆動と次の形で切り離す:

- `systemPrompt` は文字列で丸ごと置き換え、組み込みのツール・設定・セッションの保存を持たせない
- 使用量はトークン消費の記録に混ぜない（記録は会話の `query()` の累計の差で、混ぜると差が崩れる）
- 疑似セッション（`TSUKUMO_DRIVER=fake`）では起こさない（書き手の出どころで「起こさない」を選ぶ）
- 書く口は起こせない・中断・時間切れ・形の崩れでも reject せず、「作れた／作れなかった」に畳む
  （常駐プロセスは落ちない）。訪問の台本と日記の書き手は代の持ち物で、代を閉じると中断する
- 渡した文面も受け取ったものもログに書かない（9章）

## 6. browser

**6.1 は欠番**（旧「部品の木」。コードの写しだったので撤去した）。

### 6.2 状態の持ち方

| 状態                                                             | 置き場所                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionState`                                                   | `browser/stores/session.ts` の zustand の store `useSession`（`applySessionEvent` で `events` を畳み、`hello` で置き換える）。部品はセレクタで**自分が読む値だけ**を購読する  |
| 接続中 / 切断中、プロトコルの版違い                              | 同じ store に相乗りさせる（`SessionState` には入れない）。接続は `<Root>` が `useSessionConnection()` で張る                                                                  |
| 選んでいるターン（`turnId`）、追従中か（いちばん下を見ていたか） | `location.hash` の `turn`（`#?turn=3`。追従中は書かない）。`browser/stores/turn-selection.ts` の `useTurnSelection()` が hash と姿から導く（自分では状態を持たない）          |
| 入力欄の下書き、候補の開閉と選択位置                             | `<Composer>` のローカル状態                                                                                                                                                   |
| 質問の選択（送る前）・何問目を見ているか・入力欄に書いた答え     | `browser/stores/question-answer.ts` の zustand の store（**メインビューの札と入力欄の両方が読み書きする**ので機能のローカル状態にしない。どの答え待ちに対する下書きかも持つ） |
| 経過時間の秒数                                                   | `<TurnStatus>` の1秒タイマー（`turn` の `startedAt` から計算）                                                                                                                |
| 領域の比率                                                       | `<Layout>`。`localStorage` に**比率だけ**保存（会話は保存しない）                                                                                                             |
| 出している画面（会話 / キャラクター / 作る）                     | `location.hash` の `?` より前（`stores/screen.tsx` の `useScreen()` が `hashchange` を読む）。保存しない（URL が持つ。13.6）。hash の書き方は `stores/location-hash.ts` だけ  |

画面全体で共有する状態は **zustand の `create()`** で書き、`Context` の `Provider` で配らない
（書き方と `useShallow` の使いどころは `docs/coding-standards.md`「zustand の store」）。**姿そのものを
購読しない**（読む値が変わっていない部品まで毎フレーム描き直しになる）ので、部品はセレクタで読む値だけを取る。
**答え待ち（`pending`）が動くフレームだけ緊急**にし、レポートやツールの進行は `startTransition` に載せる。
**`location.hash` を正典にする状態は zustand に写さない**（`useHashRoute` が `useSyncExternalStore` で直接
購読する。写すと hash と store の2か所に持つことになる）。

### 6.3 Markdown（`components/page/conversation/components/main-view/markdown/markdown.tsx`）

```
react-markdown
  remarkPlugins: [remark-gfm]
  rehypePlugins: [rehype-raw, [rehype-sanitize, schema], rehype-highlight]
  components: { code: フェンスの言語で MermaidBlock / ChartBlock / 通常 に振り分け, a: 許可スキームだけ }
```

- Markdown 一式は**メインビューの部品の中**に置く（読み手が `<Report>` だけなので共有の箱に上げない）
- **`schema` は許可リスト**（要素・属性と `class` の語彙 `note` / `badge` / `cols` / `card` など）。`style` 属性は
  `url(` / `@import` を含むものを落とす規則も `schema` の `attributes` の正規表現で表す。**規約
  （`report-notation.ts`）・schema・部品（`notation.tsx`）・CSS の4つは同じコミットで揃える**
- **記法の class 名は部品に解決する**（`notation.tsx`）。モデルが書くのは骨格（`note` / `badge` など）で、
  **CSS が受ける class 名（`report-` 付き）は tsukumo が付ける**ので、モデルの書いた文字列とセレクタが
  直接つながらない。**知らない class 名と `style` 属性は素通し**（変換は足し算だけ）
- 引用 `> `・ネストしたリスト・水平線・列揃え（`:---:`）・コードスパンの中の HTML は GFM の仕様どおりに
  描ける。`report-notation.ts` は「描けない記法」の迂回を持たない
- **流れる本文**: 書きかけの Markdown を空行で塊に割り、塊ごとに `memo`（鍵は塊の文字列）。
  描き直すのは末尾の塊だけ。**コードフェンスと HTML ブロックの中の空行では割らない**
  （フェンスは表や見出しに化けないため、HTML は `<details>` の中身が外へこぼれないため。
  HTML は閉じタグが必須の要素だけを深さで数え、閉じタグを省ける `p` / `li` / `td` などは数えない
  ——省略された閉じタグを待つと以降ずっと割れなくなる）。**閉じていないものは末尾の塊の中に
  閉じる**ので、書きかけの間だけその塊の `memo` が効かない

### 6.4 重いライブラリ

| もの                                                               | 読み方                                                                                                                      | 置き場所            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| React・react-markdown 一式・`ws`（ブラウザ側は標準の `WebSocket`） | `vite build` が npm から束ねる                                                                                              | `node_modules`      |
| highlight.js                                                       | `rehype-highlight`（`lowlight` の common 言語）を束ねる。テーマ CSS だけ `/vendor/` で配る                                  | 束ねる / `/vendor/` |
| mermaid（5.3MB）・Chart.js                                         | **束ねず `/vendor/` で配り、その記法が出たときだけ `<script>` で読む**。`MermaidBlock` / `ChartBlock` が `useEffect` で描く | `/vendor/`          |

`/vendor/<name>` が返すのは `node_modules` の実ファイル（`src/server/view-server/adapter/vendor-asset.ts`）で、
**CDN からは読まない**。`vite build` の出力は1本（コード分割はしない。分割するとディスクに
置かないメモリ配信と噛み合わない）。

### 6.5 立ち絵の動き

**立ち絵は「1枚の矩形」として扱う**（`docs/requirements.md` 4.3）。`<Portrait>` が動かすのは
**位置・大きさ・傾き・上下・不透明度**だけで、**素材の中身には触らない**（素材は利用者が用意するので、
作られ方を当てにできない。見返りに SVG でも PNG でも GIF でも同じだけ動く）。

- **まばたき・表情のクロスフェード・部分の動きは作らない**（素材の構造に依存するため）。
  Lottie / Live2D も同じ理由で採らない
- **動くのは利用者の注意が空いているときだけ。** `SessionState` から「いま読んでいるか、待っているか」を
  決め、**読んでいる間は呼吸だけに落とす**
- 作るのは5つ。**呼吸**（常時のごく小さい上下）/ **待っている間の移動**（ターン進行中に
  領域の中をゆっくり歩く）/ **書いている**（メインが `report` の引数を書いている間、
  筆を運ぶように小さく速く横へ揺れる）/ **完了の反応**（小さく跳ねる）/ **失敗でびくっ**（一瞬のけぞる）
- **ターンが失敗で終わったときも「失敗でびくっ」にし、「完了の反応」は出さない**（材料は `turn` の
  `finished` の `ending`）。びくっのあとに跳ねると失敗を喜んで見える。**表情は変えない**（表情の源は
  `speak` だけ。`docs/requirements.md` 4.3）——動きは矩形の位置だけなのでこの原則に触れない
- **`<Portrait>` の動きは領域の外へ出さない。** **レポートの上に出てよいのはミニ立ち絵だけ**
  （`docs/requirements.md` 4.3）で、メインビュー側の別の部品が矩形を描く `components/domain/portrait.tsx` を
  共有する（「1枚の矩形しか動かさない」原則は崩れない）
- `prefers-reduced-motion: reduce` を尊重する（`src/browser/styles/theme.css`）
- 動きは CSS の `@keyframes` と `transform` で足りる。**`<canvas>` もアニメーションの
  ライブラリも要らない**（矩形しか動かさないため）

### 6.6 CSS

**CSS Modules（`*.module.css`）を領域・機能と同居させる。** 置き場は**領域・機能ごとに1枚**
（`<領域>/<領域>.module.css`・`features/<機能>/<機能>.module.css`）と、**自分の見た目を持つ共有部品の隣**
（`components/domain/portrait.module.css`）。**グローバルなのは `styles/theme.css` だけ**で、
トークン（`:root`）・`body`・フォーカスの輪・`prefers-reduced-motion`・リンクを持つ。
**16進の色を書いてよいのもそこだけ**（13.2）。同居に移した理由は `docs/history/decision.md`
「design.md 6.6 CSS（機能と同居させる形に移した理由）」。

**機能の中の部品でも、その部品しか使わない class の塊になっているなら部品の隣に `<部品>.module.css` を
置いてよい**（機能の1枚が原則で、部品の輪郭がはっきりしているときだけの例外）。

class 名は用語集の語（`balloon` / `portrait` / `turn-header` など）を**そのまま**保ち、部品からは
`styles["balloon-track"]` と引く（キャメルケースへ変換しない）。実際に DOM へ付く名前は
**組み立てのたびにハッシュ化される**ので、外から要素を指す口が要るところは `data-*` を持つ
（4領域の `data-region`。`scripts/capture-view.ts` が使う）。

**`styles["..."]` の型は、CSS に書いた class 名ごとに生成した型宣言から来る**（`happy-css-modules` が
`dist/css-module-type/` に書き、`tsconfig.json` の `rootDirs` で隣にあるものとして解決させる。部品の隣に
置かないのは、ページと部品の直下に置けるファイルが決まっているため）。CSS に無い名前は型エラーになり、
ある名前は `string` で届くので `?? ""` で受けない。

**Tailwind には移らない**（`theme.css` のトークンと `docs/screen-design.md` のトークンの節を作り直す
ことに見合う困りごとが無い）。

**機能をまたいで見た目が要るときは className を渡す**（CSS の選択子で他の機能の class を
指さない）。`<Portrait>` が例で、立ち絵そのものの中身と動きは `components/domain/portrait.module.css`、
**どこにどれだけの大きさで置くか**は呼び出し側が `className` で足す。打ち消しは**親の class から**書いて
（`.character-layout .portrait`）、読み込み順ではなく詳細度で勝たせる。

**テストの中では class 名が CSS に書いた綴りのまま届く**（`test/css-module-loader.ts` が
単体テストの設定に渡す Vite プラグイン）。Vite の既定の CSS Modules の変換はブラウザに出す
実際の名前と同じハッシュ付きの名前を生成するので、これが無いと部品テストが綴りで引けない。
CSS に無い名前は `undefined` のままなので、**綴りを間違えるとテストで落ちる**。

## 7. キャラクターパック

```
characters/<name>/
  character.json     name / portraits（表情 → ファイル名）/ outfitAccents / expressions（名前 → 日本語ラベル）/ diaryFont（日記の書体のファイル名）
  persona.md         人格。tsukumo が systemPrompt.append で足す（口調・セリフと詳細の書き分け。セリフの間合いとレポートの記法は core 側）
  *.svg / *.png      素材
  *.woff2 / *.woff / *.ttf / *.otf   日記の書体（任意。`diaryFont` が指す）
```

- **キャラクターの中身は定義が持つ**（原則4）。`speak` の enum と説明は `expressions` から作る。
  `diaryFont` はパックに同梱した書体ファイルだけを指せ、素材と同じ経路（7.2）で配る
- **二重適用を避ける**: `applyFlagSettings({ outputStyle: "default" })`（セッション限り）で
  グローバルの出力スタイルを中立に戻してから `persona.md` を足す（実測と採らない案は
  `docs/requirements.md` 4.4）
- **切り替えは別のパックでセッションを起こし直す**（`speak` の enum も人格も、起こし直せば確実に
  入れ替わる。`startSdkDriver` が `mcpServers` を毎回組み直すので `setMcpServers` は要らない）
- **キャラクターごと・モードごとに別のセッションを持つ**（印の形と探し方は `docs/requirements.md`
  4.8「鍵」）。印の組み立ても読み取りも `session-driver/core/session-restore.ts` の `sessionTag` /
  `readSessionMark` 1箇所で、`session-start.ts` はそれを探す側と付ける側の両方に渡す

**探索先は3箇所で、同名は後ろが勝つ**（`listCharacterPacks`）:

| 順  | 置き場                            | 中身                                            |
| --- | --------------------------------- | ----------------------------------------------- |
| 1   | 同梱の `characters/*`             | `tsukumo` / `tsukumo-spirit`（自作の既定）      |
| 2   | `~/.tsukumo/characters/*`         | **画面から作ったパック**（全プロジェクト共通）  |
| 3   | 起動先の `<cwd>/characters/local` | そのプロジェクトで用意した素材（1つ固定のまま） |

**`systemPrompt` の append を組むのは `system-prompt/core/system-prompt.ts` の `takeSystemPromptAppend` 1つだけ**
（寄せた理由は `docs/architecture.md`「新しいコードを置く場所」）。**`persona.md` の全文を fs から
読むのは adapter（`character-pack.ts`）で、組み立てには文字列で渡す**ので、`core` はパックの型も fs
も知らない。並びはモードで入れ替わる:

| 場面                             | append に入る節の並び                           |
| -------------------------------- | ----------------------------------------------- |
| 仕事                             | 人格 → セリフの間合い → レポートの記法          |
| 雑談（記憶が載るとき）           | 人格 → 雑談の作法 → 前回までの要約 → 直近の雑談 |
| 雑談（続きから・写しが渡し済み） | 人格 → 雑談の作法                               |

- **人格が無いパックは先頭が落ちるだけ**（tsukumo 側の規約だけで起動する）
- **雑談の記憶の節は、中身が無ければそれぞれ落ちる**（載せる条件は `docs/chat-mode.md` 4.9
  「載せる条件は2つあり、どちらかに当たれば載せる」）
- **仕事と雑談は入れ替え**（並べない。理由は `chat/core/chat-manner.ts` の冒頭）

### 7.1 画面から作るときの置き場と受け取り方

**書き込み先は `~/.tsukumo/characters/<name>/` の1箇所だけ。** 同梱の `characters/*` と起動先の
`characters/local` はどの経路でも書かず、消さない（リポジトリの作業ツリーが汚れず、権利のある素材が
公開リポジトリに入る経路が生まれない。`cwd` に依存させない理由は `docs/requirements.md` 4.4）。

**画像は data URL を JSON に載せ、いまの WebSocket のコマンドで受け取る。**
`src/shared/contract/character-pack.ts` に手続きを足すだけで、`src/server/view-server/adapter/server.ts` に新しい
書き込み経路を作らない。起動トークンと `Origin` の照合・zod の検証・定型文の `REFUSED` がそのまま効く
（multipart の POST と生バイトの POST を採らない理由は `docs/history/decision.md`「design.md 7.
キャラクターパック（2026-09-27 に仕様を持ち主へ返したときに落とした経緯と採らない案）」）。

| 何                        | 上限                                                         |
| ------------------------- | ------------------------------------------------------------ |
| 画像1枚（デコード後）     | 2 MiB                                                        |
| 1つのパックが持てる画像   | 表情の数 + 4 枚（ミニ立ち絵・背景・顔・訪問の peek）         |
| WebSocket の `maxPayload` | 16 MiB（依頼に添える画像の上限で決まる。4.10「上限」と同じ） |

- **受け取った文字列をパスにしない。** パックの名前は shared のスキーマ（`isCharacterPackName`。
  `[A-Za-z0-9._-]` だけ・`.` で始まらない）で検証し、ファイル名は受け取らず種類と形式から組む
  （`<表情>.<svg|png|gif>`・`background.<png|jpg|webp>`・`face.<svg|png|gif>`）。同じ表情の差し替えは
  同じ名前の上書きになる
- **書き込む先のパックはコマンドが名前（`pack`）で指し、サーバは一覧と突き合わせて引くだけ**
  （素材を配るのと同じ `findCharacterPack` の規則。使用中のパックで置き換えた一覧）。名前から
  ディレクトリを組み立てない。無いパック・起動先の `characters/local` と同じ名前のパック
  （`isEditableCharacterPack` が false）は書かず、理由を分けない定型文の `REFUSED` を返す
- **初めて変えるときに、書き込む先のパックをホームへ丸ごと写す**（`copyPackOnce`。定義・
  `persona.md`・素材。人格ごと写さないと次の起動で人格が消える）。ホームに同じ名前があれば写さない
- **参照が外れた素材は消す**（消すのはホームのそのパックの中の、どの定義からも参照されていない
  画像だけ）
- **反映はセッションを起こし直さず、`character-changed` を流し直すだけ**（一覧は 7.2 の契機で
  読み直される）

**新しく作るときの細部**: **ディレクトリ名になるのは `id` だけ**で、表示名（`name`）は
`character.json` の値にすぎない。既にある id は画面とサーバの両方で弾く（探索の順で後ろが勝つので、
作れてしまうと既存のパックが黙って隠れる）。書く順は**素材 → `character.json`** で、途中で失敗した
書きかけのディレクトリは消す（定義を持たないので一覧にも出ない）。表示名が空なら `name` を書かず、
読む側が id へ折り返す既存の仕組みに乗る（`definitionWithName`）。

**消すときの細部**: **消せるのはホームの版だけ。** 届いた名前はパスに使わず一覧から引き、**引けた
パックの場所が `<ホームの置き場>/<名前>` そのものであるときだけ消す**（同名は後ろが勝つので、起動先の
`local`・一覧の外・同梱だけのパックはここで外れる。シンボリックリンクなら消えるのはリンクだけ）。
消したあとに何が起きるかの判定は `characterPackRemoval` 1つが持ち、画面に配る値と消す側が断る判断の
両方がそこを通る。パックの外にある雑談の記録（7.3）を一緒に消すのは配線層（`src/current-character.ts`）で、
記録が消せなくてもパックを消したことは取り消さない。

### 7.2 パックの一覧と素材の URL

**1件の形は `CharacterPackEntry`**（`src/shared/character.ts`。姿は `CharacterInfo` をそのまま入れ子で
持つ）。**変えられるか（`editable`）・消すと何が起きるか（`removal`）はサーバが決めて持たせ**、画面は
理由を推し量らない。

**一覧を配り直す契機は `character-changed` を組むたび**（`src/current-character.ts` の `event`）。
パックの集まりを変える口はどれも「書いたら `event()` を返す」だけで一覧が配り直される（口ごとに
読み直しを呼ぶ形にしない。1つ呼び忘れると古い一覧が黙って配られる）。素材を配るときに突き合わせる
一覧も、最後に `event()` で読んだものを使う。

**素材の URL は `/character/<pack>/<file>?v=<版>` の1つの形に揃える**（使用中のパックも同じ）:

- パック名とファイル名は**それぞれ `encodeURIComponent` した1区間**。組み立て（`characterAssetPath`）と
  読み分け（`readCharacterAssetPath`）は `src/shared/character-asset.ts` の1箇所で、区切りの `/` が
  ちょうど1つでない経路・デコードできない経路は 404
- **取り直しの印（`?v=`）は素材の版（更新時刻）だけ**（ファイル名が同じまま中身だけ変わるため）。
  配る側は `?` 以降を見ない
- **配ってよいのは、一覧にあるパックの、そのパックの定義に載っているファイル名だけ**
  （`readCharacterAsset` → `readCharacterPackFile`。allowlist はパックごと）
- **一覧の中の、使用中と同じ名前の1件は使用中のパックに置き換える**（無ければ末尾に足す）。画面に
  出すもの・配るものが「いま出しているもの」とずれない
- 素材はトークン無しで配る（9章）

### 7.3 雑談の記憶の置き場

**雑談の記憶は `~/.tsukumo/` の下の、キャラクターパックの外に置く。** 仕様（何を・いつ・どんな形で
書き、どう読み戻すか・上限）は `docs/chat-mode.md` 4.9 が正典で、ここは置き場と持ち場だけを持つ。

| 何                             | 置き場                                                               | ファイルに触る adapter                    |
| ------------------------------ | -------------------------------------------------------------------- | ----------------------------------------- |
| あらすじ（と渡し済みの印）     | `~/.tsukumo/chat-summary/<pack>.md`                                  | `chat/adapter/chat-summary.ts`            |
| 雑談の会話のアーカイブ         | `~/.tsukumo/chat-archive/<pack>/<YYYY-MM-DD>.jsonl`                  | `chat/adapter/chat-archive.ts`            |
| エピソード索引・思い出した記録 | `~/.tsukumo/chat-archive/<pack>/episode.jsonl` / `recalled.jsonl`    | `chat/adapter/chat-archive.ts`（同じ1つ） |
| 覚えたこと                     | `~/.tsukumo/characters/<pack>/persona.md` の末尾の節（7.1 の置き場） | `chat/adapter/persona-memory.ts`          |

- **パックのディレクトリの中に置かない**（覚えたことを除く）。会話に由来する文章を混ぜると**パックを
  渡すことが会話を渡すことになる**。覚えたことはキャラクターの属性1行で、7.1 の道に乗る
- **`cwd` に依存させない**。**鍵はパックの名前1つだけ**で、`isCharacterPackName` を通してからパスを
  組む。日付のファイルとエピソード索引は**名前で見分ける**（窓の側は `YYYY-MM-DD.jsonl` にだけ
  当たる正規表現でファイルを選ぶ）
- **口（型）は `session-driver/core/session-driver.ts`、ファイルに触るのは上の adapter、結ぶのは配線層
  （`src/session-start.ts`）。** 置き場を差し替えられる `root` 引数も同じ手で持つ（テストがホームを
  汚さない）
- **アーカイブへ書くのは `session/core/session-manager.ts` の `receive`**（イベントが1件ずつ通る
  場所）。復元の再生は駆動と別の口（`onRestoredEvent`）で流し、`session-manager` は駆動から新しく
  届いたぶんだけを書く。読み戻しはセッションを起こすとき1回だけで、配線層が呼ぶ
- **判断は `chat/core/` の純関数**（載せる判断・定着の指示文と検査・採点。アダプタは読んで渡すだけ）で、
  **定着の契機（ターンの終わり・同時に1本）は `session-manager` が持つ**。走っているかどうかの1ビットは
  駆動の代ではなく `session-manager` 自身が持つ（起こし直しで代だけを作り直しても、同じ行を2本で畳まない）。
  容量の表と採点の係数は複数の機能が読むので `src/shared/chat-memory-budget.ts`

## 8. セッションの復元と複数化

**復元の決定は `docs/requirements.md` 4.8 のまま**（`cwd` + tsukumo の印（パックごと。7章）、
常に自動で続きから、**復元のためには**会話を保存しない、失敗したら新規で起こす）。**雑談の会話の
アーカイブ（7.3）は復元の材料ではない** — 画面を組み直すのは transcript からで、アーカイブは読み戻さない。

- 画面の履歴の組み直しは「`getSessionMessages` → `SessionEvent[]`（時刻付き）→ `session-manager` の
  `state` に畳む」だけ。接続したブラウザは `hello` の snapshot でそのまま同じ姿になる
  （**ブラウザ側に復元の特別な経路は要らない**）
- 逃げ道は `TSUKUMO_NEW_SESSION=1`（起動時）と、画面から新規に起こすコマンド（契約に
  はまだ足していない）
- **どのセッションの続きから始めるかは画面から選べる**（サイドバーの「セッション」の `<select>` →
  `session.switchSession` → `session-launch` の起こし直し）。並ぶのは**同じパック・同じモードの、
  目印（`@7327` / `@7328`）違い**で、新しいほうから `MAX_SESSION_CHOICES` 件まで。**起動時は
  自動で続きから始まる**（選ばせる画面は出さない）

**複数化はやらない**（`docs/requirements.md` 2.2）。**`SessionManager` はセッションを1つだけ持ち、
鍵（`sessionId`）を持たない**。キャラクター・雑談モード・セッションの切り替えは、同じ `SessionManager` の
中で駆動を起こし直す（何代目かの印で古い駆動のイベントを捨てる）ので、古い側と新しい側を
並べて持つ場面が無い。`hello` も `sessionId` を名乗らない（画面に出るセッションのIDは
`SessionState` の側にある claude 自身のID）。広げるときの形はここに描かない
（要件から落としたので、描いておくと布石として読まれる）。

## 9. 会話内容と安全

`docs/coding-standards.md`「会話内容の扱い」は最優先のまま。境界と、会話をディスクに書く例外:

| 項目                                               | 扱い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| バインド先                                         | `127.0.0.1` だけ。変えない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Origin                                             | WebSocket の upgrade で確かめる（`Origin` が無ければ通す、あれば自分と一致）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 起動トークン                                       | 起動ごとに乱数を1つ作り、`/ws?t=` で要求する。ページの URL に付けて配る（`showView` に渡す URL に含む）。同じマシンの別プロセスが `127.0.0.1:7327` を読める、という既知の割り切りを塞ぐ                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ディスク                                           | 会話を**書く**のは**3つの例外だけ**（下の「あらすじ」「雑談の会話のアーカイブ」「エピソード索引」。「直近の雑談を逐語で読み戻す」と「定着」の行は書かずに**読む・渡す**ほう）。組み立てた成果物（`dist/browser/`）に会話は入らない。`localStorage` に置くのは領域の比率だけ（キャラクターパックへ書くのは**会話ではなくキャラクターの属性1行**だけ。下の行）                                                                                                                                                                                                                                                           |
| ブラウザ側のメモリ                                 | `SessionState` として会話の一部を持つ。**同じオリジンの `127.0.0.1` のタブの中に閉じる**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ログ                                               | 断ったときの理由（`REFUSED`）は定型文。サーバの stderr に会話を出さない                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 定着（雑談の記憶を畳む）                           | 窓から溢れた雑談の逐語を、背景の使い捨て `query()`（同じマシンの claude の子プロセス。`persistSession: false`・ツールなし）に渡してエピソードとあらすじを書かせる。**ユーザーが認めた例外**（`docs/requirements.md` 2.2 の外部送信に当たらない。範囲と形は `docs/chat-mode.md` 4.9「窓から溢れた会話は定着で畳む」、置き場は 7.3）。渡した文面も受け取った出力も**画面にも 手続きの応答にも stderr にも出さない**（画面に出すのは話題の見出しだけ）。tsukumo は `/compact` を投げない                                                                                                                                  |
| あらすじ                                           | `~/.tsukumo/chat-summary/<pack>.md` に**最新の1つだけ**を上書きで持つ（8 KiB まで。書くのは定着）。**ユーザーが認めた「別の場所に複製しない」の例外の1つ目**（範囲・理由・形・上限は `docs/chat-mode.md` 4.9、置き場は 7.3）。載せ直すのは**雑談のセッションの `systemPrompt`** で、条件は「新規に起こした」か「`/clear` を見たあと」の2つ（1行目の印が持つ）                                                                                                                                                                                                                                                          |
| 雑談の会話のアーカイブ                             | `~/.tsukumo/chat-archive/<pack>/<日付>.jsonl` に、雑談の依頼とセリフを表情つきで1行ずつ追記する。**ユーザーが認めた「別の場所に複製しない」の例外の2つ目**（範囲・理由・形・上限は `docs/chat-mode.md` 4.9、置き場は 7.3）。**画面の 100 ターンには影響されない。** 画面にも 手続きの応答にも stderr にも出さない                                                                                                                                                                                                                                                                                                      |
| エピソード索引                                     | `~/.tsukumo/chat-archive/<pack>/episode.jsonl` に、定着が書いた見出し・要旨・手がかり語と、アーカイブの行の範囲を1件ずつ追記する（思い出した記録は `recalled.jsonl`。文面を持たない）。**例外の3つ目**。**逐語は持たず、アーカイブを指す目次**。`recall` の一覧と `recall_episode` の1件（8 KiB・1ターンに2件）だけが雑談の文脈へ戻す（範囲と形は `docs/chat-mode.md` 4.9、置き場は 7.3）                                                                                                                                                                                                                              |
| 直近の雑談を逐語で読み戻す                         | アーカイブの**新しいほうから 64 KiB まで**を読み、**雑談のセッションの `systemPrompt`** へ逐語のまま載せる。載せる条件はあらすじと同じ2つ。**渡す先はそこだけ**で、画面にも手続きの応答にも stderr にも出さず、**仕事の側の文脈にも載せない**。逐語が新しいセッションの transcript に書かれることは承認に含まれる（範囲と量は `docs/chat-mode.md` 4.9「直近の会話は逐語のまま読み戻す」、読み口の置き場は 7.3）                                                                                                                                                                                                        |
| 人格への書き戻し（覚えたこと）                     | 雑談で覚えたことを `~/.tsukumo/characters/<pack>/persona.md` の末尾の節へ1行ずつ足す。**利用者については書かない**（範囲・形・上限は `docs/chat-mode.md` 4.9）。会話の文面はディスクに届かない                                                                                                                                                                                                                                                                                                                                                                                                                         |
| コンテキストの内訳の記録                           | `~/.tsukumo/context-usage/<日付>.jsonl` に、**セッション1つにつき1行**だけ積む（最初のターンが終わったとき、`detail: "full"` で取った値）。**会話の複製ではない** — 入るのは数と、SDK が内訳として返す名前（分類の表示名・MCP ツール名・メモリファイルのパス・スキル名）だけで、文面の口が型に無い。**ターンごとのトークン消費の記録（`~/.tsukumo/token-usage/`）とは置き場も版も分ける** — 「書いてよいもの」の線が種類ごとに違い、同じファイルに混ぜると広いほうの線が狭いほうにもかかるため（線の正典は `src/shared/context-usage-record.ts`）                                                                      |
| 見直しの結果と見送りの記録                         | `~/.tsukumo/usage-review.json`（前回の見直しの結果。直前の1回だけ）と `~/.tsukumo/usage-review-dismissed.json`（見送った提案の識別子）。**会話の複製ではない** — 入るのはスキルが渡した見直しの結果（`UsageReviewFindings`。見出し・根拠・やることの文字列を含むが、これ自体が「見直しの結果」であって会話ではない）と、種類:対象の形の識別子の文字列だけ（線の正典は `src/shared/usage-review.ts`）                                                                                                                                                                                                                   |
| 日記                                               | `~/.tsukumo/diary/<リポジトリ>/<日付>.json` に、振り返りの使い捨ての問い合わせでキャラクターが `diary` ツールで渡した日記（本文・しおり・表情）を、書いた時刻と書いたパックの名前を添えて日ごとに書き足す（**ユーザーの決定**。置き場と形は `src/server/diary/adapter/diary.ts` の冒頭）。**会話の複製ではない** — 入るのはツールが渡した日記（キャラクターがその日の仕事について書いた成果物）と、タスクの ID・`summary`・理由だけで、依頼の文面・セリフ・ほかのツールの引数と結果は通らない（線の正典は `src/shared/diary.ts`）。**文面はログにも 手続きの応答にも stderr にも出さず、画面（成果の画面）にだけ配る** |
| テストのフィクスチャ・fake driver の疑似セッション | 手で書いた架空の会話だけ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

例外を認めた日付と発言は `docs/history/decision.md`「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」。

## 10. テスト

| 対象                           | 方法                                                                                                                                            | 置き場所                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| reducer（`applySessionEvent`） | 純粋関数として単体で                                                                                                                            | `test/shared/session-state.test.ts`                      |
| zod スキーマ                   | 受け付ける形・落とす形を1件ずつ                                                                                                                 | `test/shared/command.test.ts` など                       |
| SDK の型との一致               | `PERMISSION_MODES` / `MODEL_ALIASES` が SDK の型と同じ値であること（型レベルの検査）                                                            | `test/server/session-driver/adapter/sdk-driver.test.ts`  |
| `session-manager`              | fake driver を差し込み、`hello` → `events` の順序・バッチ・`dispatch` の分岐                                                                    | `test/server/session/core/session-manager.test.ts`       |
| `server`（ws）                 | 購読 → `hello` が先に届き、押した順に取りこぼさず流れる、切断で購読が外れる、トークン無しは 403、Origin 違いは 403、コマンド → 受け手が呼ばれる | `test/server/view-server/adapter/session-socket.test.ts` |
| browser の部品                 | Vitest + `happy-dom` + `@testing-library/react`。**役割と文言で当てる**（HTML の文字列一致はしない）                                            | `test/browser/**`                                        |
| 層の検査                       | 層の辺・機能どうしの辺・browser の箱と領域の辺（2章）。外部ツールは増やさない                                                                   | `test/architecture.test.ts`                              |
| 画面の見た目                   | **fake driver で起こした tsukumo に Playwright**（`webapp-testing` スキル）。数値で読めるものは CDP で読む。色・間合いは人の目                  | `scripts/`（本体から呼ばれない）                         |
| 状態のカタログ                 | 疑似セッションの場面を名指しして起こし直し、広い窓と狭い窓で撮って索引 HTML に並べる（`TSUKUMO_FAKE_SCENE`）                                    | `scripts/capture-catalog.ts`                             |
| E2E                            | **fake driver で起こした tsukumo を手元の Chrome で開き、DOM の構造と WebSocket の流れを期待値と比べる**（下の「E2E」）                         | `test/e2e/`                                              |

**DOM の構造と画面の流れは E2E で守り、見た目（色・崩れ・間合い）は目視で確かめる。** E2E が判定に
使うのは DOM の構造と WebSocket のメッセージの列だけで、スクリーンショットは目視の添え物（判定しない）。
目視の手順は `docs/architecture.md`「手で確かめること」。足場（起こす・開く・成果物を書く・比べる）は
`test/e2e/scenario-run.ts` の1ファイルで、シナリオはそれを呼ぶだけにする。

### E2E の走らせ方

- **ランナーは Vitest**（単体テストとランナーを共有する）。ブラウザは `playwright-core` の `chromium`
  （`channel: "chrome"`、headless）。**新しい外部コマンドは足さない**
- **置き場所は `test/e2e/<シナリオ>.test.ts`**（1ファイル = 1つの機能のまとまり。E2E は1つのファイルの
  振る舞いではないので、`src/` の写しの構成には従わない）
- **`bun run check` の中の別の段にする**（`bun run test` は既定の設定が `test/e2e/` を外し、E2E は
  `bun run test:e2e` が E2E 専用の設定で走らせる）。時間切れの既定を E2E の段だけ延ばし、単体テストを
  1ファイル走らせるときに Chrome を要らないままにするため。E2E の設定はファイルを並べず
  （`fileParallelism: false`。並べると負荷で待ちが揺れる）、単体の `setupFiles` の DOM のグローバルを渡さない
- **`dist/browser/` は E2E の段が自分で組み立てる**（起動は古い成果物でも止まらずに配る〔11章〕ので、
  組み立てを前提にすると古い画面を確かめて通ってしまう）。**Chrome が無ければ前提不足で落ちる**
  （飛ばすと黙って守らなくなる）
- **ブラウザは1ファイルに1つ、tsukumo は1件ごとに1つ起こす**。後始末は自分の pid だけに `SIGTERM` を
  送り、終わるのを待ってから一時のディレクトリを消す（広いパターンで止めない）
- **起こし方**: fake driver・空きポート・自動オープンなし・**`TSUKUMO_HOME` と cwd は1件ごとの
  一時ディレクトリ**（リポジトリで起こすと `develop/task/` の実データと git の履歴が画面に入る）・
  `TZ=Asia/Tokyo`・下の固定の時計。**親の環境から `TSUKUMO_` で始まる変数は外してから渡す**
- **名指しの場面も `opening` も、ページが繋がってから流れ始める**（起こした直後に流すと、繋がる前の
  ぶんが `hello` に畳まれてメッセージの列が揃わない）。**場面が流れ終わるのを時間で待たず**、届いた
  イベントを待つ。長い場面は途中のイベントで止めて撮る。**場面を速く流す口は足さない**（ブラウザ側の
  間合いとの比が変わる）。必要な瞬間が遅い場面は、短い場面を疑似セッションに足す
- 所要時間の目安は E2E の段で 60 秒まで。超えたら件を削らずに `--parallel` を足す

### E2E の成果物と再現

**判定に使うのは2つの JSON だけ**。何を残し・落とし・置き換えるかの実装は `test/e2e/scenario-run.ts`。

- **DOM の構造**（`<シナリオ>.dom.json`）: 残すのは要素の名前・`role`・`aria-*`・`data-*`・入力の状態・
  `href` と `src` のパス・文字。**落とすのは `class`・`style`・`id`・描かれていない要素・図とグラフの中身・
  属性を1つも持たない `div` / `span`**（見た目の直しのたびに変わるもの）。**状態が `class` にしか
  出ていないものは、E2E で見たくなったときに `data-*` か `aria-*` に出す**（意味の契約は `data-*`・
  `aria-*`・文字に置く）
- **WebSocket のメッセージの列**（`<シナリオ>.messages.json`）: コマンドとフレームを届いた順に並べる。
  `events` は束をほどいてイベント1件ずつにし（束の切れ目は走らせるたびに変わる）、`hello` は版だけ、
  `character-changed` はいまのパックの名前と表情だけを残す
- **両方に共通の置き換え**: リポジトリ・一時のホーム・一時の cwd・ポートを `<root>` などの印に置き換え、
  **起動トークンは成果物に書かない**

**時計の固定**:

- **サーバの時計は `TSUKUMO_FIXED_CLOCK` で凍らせる**（進む時計だと `at` と「N 秒」が走らせるたびに
  ずれる。経過の計算は `shared` の単体テストが守る）
- **`Temporal.Now` を読むのはサーバの `src/server/adapter/local-time.ts` と、ブラウザの
  `src/browser/utils/clock.ts` の2つだけ**で、`test/architecture.test.ts` がそれを縛る（固定が黙って
  効かなくならないように）
- **ブラウザの時計は E2E の側だけで差し替える**（`page.clock` は `Temporal.Now` を差し替えないので、
  初期スクリプトで `Temporal.Now.instant()` を `Date.now()` に従わせる。本番のコードに試験用の口を作らない）。
  止めたあとは DOM の構造が2回続けて同じになるまで読み直してから書く
- ビューポートは 1400x900（狭い窓の積み替えを見るシナリオだけ 720x900）、`reducedMotion: "reduce"`。
  **書体は固定しない**（判定は画素を見ない）

**置き場所と比べ方**: 期待値は `test/e2e/expected/<シナリオ>.*.json` に置いてリポジトリに入れ、走らせた
結果とスクリーンショットは `/tmp/tsukumo-e2e/<シナリオ>/` に毎回書き直す。比べ方は `toEqual` で、
**期待値が無ければ落とす**（黙って書かない）。**期待値の更新**は `bun run test:e2e:update` → `git diff
test/e2e/expected/` で意図した変化だけであることを確かめる → 直した変更と同じコミットに入れる。

### E2E のシナリオの一覧

「載せない」は終わりの構造では捕まえられないもの。

| シナリオ（機能）                                      | 場面（`fake-session.json`）                                                                                                       | ファイル（`test/e2e/`） |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| ターンの流れ（依頼 → ツール → report → 締めのセリフ） | `report-tool`                                                                                                                     | `turn-flow`             |
| 入力欄から送る（`prompt` が流れ、`request` が戻る）   | 名指し無し（`opening` → 送ると `report`）                                                                                         | `input-dispatch`        |
| speak → キャラビューの吹き出し                        | `closing-narration`・`question-multi`（セリフ3つ）                                                                                | `speak-bubble`          |
| report → メインビュー（記法・差し戻し・整え）         | `notation`・`report-rejected`・`report-tidied`                                                                                    | `report-main-view`      |
| 途中の発話と流れる本文                                | `narration`・`long-report`                                                                                                        | `narration-flow`        |
| 許可のモーダル（押すと `answer` が流れ、箱が消える）  | `permission`                                                                                                                      | `permission-answer`     |
| 質問（単数・複数・プレビュー）                        | `question-pair`・`question-multi`・`question-long`・`question-preview`                                                            | `question-ask`          |
| 続きのターン（`turn-resumed`）                        | `resumed-report`                                                                                                                  | `turn-resumed`          |
| ツールの実行といまの作業                              | `long-tool`（`tool-started` の直後で撮る）                                                                                        | `current-work`          |
| 背景のタスク                                          | `background-task-short`（再開まで数秒。長い版 `background-task` は再開まで 12 秒超）                                              | `background-task`       |
| 最終レポートの札                                      | `background-task-interim-report`                                                                                                  | `final-report-label`    |
| ターンの履歴                                          | `turn-history`                                                                                                                    | `turn-history`          |
| タスクの一覧                                          | 名指し無し（`opening` のみ）。ブラウザが繋がったあと cwd に `git init` して `develop/task/` を手書きし、`main` へコミットする足場 | `task-list`             |
| 雑談の切り替えと忘却の区切り                          | `chat-compact-boundary`                                                                                                           | `chat-compact-boundary` |
| 復元した雑談の履歴                                    | `chat-restored-history`                                                                                                           | `chat-restored-history` |
| 途中のちらつき・止まって見える発話                    | `interim-flicker`・`narration-stuck`・`narration-flash`                                                                           | 載せない（目視）        |

**まだ無いシナリオ**: `/` の補完（`opening` のコマンド一覧に打つ）・`@` の補完（一時の cwd に手書きの
ファイルを置く足場が要る）・API の不調（`api-retry`・`api-failure`・`rate-limit`）・書き終わりの知らせ
（`diary-written`）・訪問の出入り（`visit-long-tool`・`visit-background`。メッセージの列だけ）・確認の
モーダルと日記帳の見開きといまの作業の失敗（疑似セッションに場面が足りない）。成果の画面・キャラクター
画面・使用量の画面は、一時の cwd とホームに手書きの材料を置く足場ができてから足す。

### E2E に任せず単体テストに残すもの

E2E が通るのは**疑似セッションに書いた並びだけ**で、fake driver は `SessionEvent` を直に流すので
**SDK のメッセージから `SessionEvent` への写しは1行も通らない**。次は E2E があっても単体テストに
残す:

- `sdk-` で始まるファイルの写し（SDK のメッセージ → `SessionEvent`）の全部
- 畳み込み（`applySessionEvent` など `test/shared`）のうち、**疑似セッションに同じ並びが無い
  もの**・**未知の `type` / `kind` を無視するもの**・境界の検証（zod スキーマの受け付ける形と
  落とす形）。消してよいのは、同じ並びをシナリオが流して DOM の構造で結果を固定しているものだけ
- 時刻に依る計算（経過・日の境目）。E2E は時計を凍らせるので見えない
- 再接続・版の食い違い・バッチの束ね方・エラー方針の分岐（起動時の即時終了・その回だけ諦める）
- `docs/coding-standards.md`「消すかどうか」表で「残す」としたもの（書式の固定・回帰テスト）

## 11. ビルドと依存

- **成果物は事前に組み立てて `dist/browser/` に置き、起動（`src/main.ts`）は置いてあるものを読む**
  （`docs/architecture.md`「ブラウザ側は事前に組み立てて置く」）。作るのは `bun run build`
  （`scripts/build-ui.ts`）だけで、`bun run dev` も起こす前に1回組み立てる（HMR を止めたときに戻る先）
- `bun run build` が起こすのは `node node_modules/vite/bin/vite.js build src/browser --config vite.config.ts --outDir dist/browser`
  の1本で、`main.js` と `main.css` の対が置かれる（名前をハッシュ付きにせず固定する理由と、JS API ではなく
  CLI を起こす理由は `docs/architecture.md`「組み立ては `vite build` の CLI を子プロセスで起こす」）
- **`dist/` は `.gitignore` する。** リポジトリを取り直したら `bun install` のあとに `bun run build` を
  1回打つ（`tsukumo` は `bun link` でこのリポジトリを指しているので、**「配布」の実体はこのリポジトリ
  そのもの**）
- **成果物が無ければ起動しない**（起動時の前提不足。理由に `bun run build` を添える）。**ソース
  （`src/browser/` と `src/shared/`）のほうが新しければ、1行知らせてそのまま配る**（古くても画面は
  動くので止めず、黙って配らないことで事故を防ぐ）。HMR と違い、ここは `src/shared/` も見る

**作り直しを押す仕組み。** 開発中は HMR で差し替える。`bun run dev`（= `bun run build && node src/cli.ts --dev`）で起こすと、
`src/server/view-server/adapter/ui-dev-server.ts` が Vite の開発サーバを **middleware mode** で起こし、
ビューサーバ（`node:http`）に差し込む。設定は組み立てと同じ `vite.config.ts` で、root は `src/browser/`。

- **配り方は `server.ts` の `ViewUi` の合併型**（`bundle` / `dev`）。`dev` のとき、ページは
  `<script type="module" src="/main.tsx">` を開発サーバの `transformIndexHtml` に通したもので、
  **経路の表に無い要求だけ**を開発サーバへ回す（`/rpc`・`/vendor/`・`/character/`・`/prompt-image/` の
  経路と守り方は変わらない。`/assets/` の対は `dev` のあいだ 404）
- **HMR の WebSocket は `/vite-hmr`**。`/ws` の受け口は合わない upgrade を閉じるので、Vite が受ける
  upgrade は触らずに譲る（`ownsUpgrade` / `yieldsUpgrade`）
- **本番（`tsukumo`・`bun run start`）では Vite を読み込まない。** `vite` は `startUiDevServer` の中で
  動的に import し、呼ぶのは `--dev` のときだけ（常に入れると仕事中の保存で画面が差し替わりうる）
- **開発サーバは `dist/browser/` を書き換えない**（次の起動に乗せるには `bun run build` が要る）。
  **型を見ない**ので、型エラーだけのコードはそのまま当たる。**当たるのはブラウザに配る側だけ**:

| 直した場所                                | どうなるか                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/browser/` の部品（`.tsx`）           | 差分が当たり、部品の状態を保つ（React Fast Refresh）                                                   |
| `src/browser/**/*.module.css`             | 差分が当たる（class 名は開発サーバの中で JS と CSS が揃う）                                            |
| `src/browser/` の部品以外の `.ts`         | Vite が当てられないと判断すればページごと読み込み直す。状態は繋ぎ直しの `hello` で戻る                 |
| `src/shared/`・`src/server/`・`src/` 直下 | **プロセスの上げ直しが要る**。そのあと `src/browser/` か `src/shared/` を保存すると HMR が止まる（下） |

- **サーバ側のソースが起動時から変わっていたら、HMR を止める。** `src/shared/` は**畳み込みがサーバ側でも
  回っている**ので、同じ作業ツリーで両方が変わると新しい契約の画面が古いサーバと話すことになる。開発
  サーバの始めに**サーバ側のソース（`src/` の下で `browser/` 以外）の中身の指紋**を取り、保存のたびに
  （プラグインの `hotUpdate`）取り直して比べる（`source-fingerprint.ts`。時刻ではなく中身で比べ、
  取れなかったときは当てる）。違えば何も当てず、**配り方を起動のときに読んだ対（`bundle`）へ戻して**
  `refresh` の `page` を押し、理由の1行をペインに出す
- **`refresh` フレーム**（4.4）は、この戻すときの `page` にだけ使う（`style` は押さない）

**足す依存**（**ユーザーの承認済み**。ここに無いものを足すときは改めて承認を得る。承認の日付は
`docs/history/decision.md`「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」）:

| 種別    | パッケージ                                                                         | 用途                                                         |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| runtime | `react` `react-dom`                                                                | browser                                                      |
| runtime | `ws`                                                                               | core の WebSocket サーバ                                     |
| runtime | `react-markdown` `remark-gfm` `rehype-raw` `rehype-sanitize` `rehype-highlight`    | Markdown                                                     |
| runtime | `remark-cjk-friendly`                                                              | CJK の強調（`**「…」**`）                                    |
| runtime | `remeda`                                                                           | 型ガードなど一般的な小物（`isPlainObject` / `isObjectType`） |
| runtime | `mermaid` `chart.js` `highlight.js`                                                | ブラウザへそのまま配る外部ライブラリ（6.4）                  |
| dev     | `@types/react` `@types/react-dom` `@types/ws` `@testing-library/react` `happy-dom` | 型とテスト                                                   |
| dev     | `playwright-core`                                                                  | 画面の確認（`scripts/capture-*.ts`）と E2E（10章）           |
| dev     | `vitest` `vite`                                                                    | テストランナーとブラウザ側の組み立て・開発サーバ             |

`zod` と `@anthropic-ai/claude-agent-sdk` はある。`ws` を選ぶのは **`Bun.*` の固有 API に寄せない**ため。
**`playwright-core` はブラウザを落とさず手元の Google Chrome を動かし**、テストランナー（`@playwright/test`）は足さない。
