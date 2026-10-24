# アーキテクチャ詳細: コマンドの受け手と手続きの置き方

ステータス: **正典**。入口は `docs/architecture.md`（全体構造の入口と、子のファイルの一覧）。

責務: 画面からのコマンドと読み取りの手続き（oRPC）を、どの機能が受け、どの条件で断るかの置き方と、許す依存の辺を持つ。
読む時: コマンドや手続きを足すとき、断る条件の置き場所を確かめたいとき。
直す時: 受け手の種類・断る条件の置き方・手続きまわりの許す依存の辺を変えたとき（辺は `test/architecture/layer.test.ts` が見る）。

## 節の索引

| 節                                    | 中身                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| #### コマンドの受け手と手続きの置き方 | 辿り方の4段、置くものと場所、断る条件は契約の `meta`、受け手の3種、値を返す手続き、許す依存の辺 |

## 全体構成

### サーバの機能と、機能どうしの辺

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
  中身を選ぶのはその機能の組み立て（`src/wiring/<機能>.ts`）
- **束ねるのを配線に置く理由**: 表を `session/core/` で束ねると、`session` が `usage-review` と
  `host` を読む辺（いまの表に無い）が要り、`session` がまた全部を知る場所に戻る。配線なら
  **機能どうしの辺の表は増えない**。葉の機能の表と手続きが読むのは `shared` と共有の `core`
  （`command-receiver.ts`）と自分の機能だけ
- **葉の機能の手続きが context の `session` から見るのは、イベントを流す口（`CommandEventSink`）だけ。**
  見直しだけは、提案を識別子で引くのと会話のモデルを読むために、`state()` の欄を3つ（モデル・いまの結果・
  前回の結果）だけ型に足して見る（`UsageReviewSession`）。型は `shared` の `SessionState` から選ぶので、辺は増えない
- **押し出しも手続き**（購読 `frame.subscribe`）。`/ws` の上は**すべて oRPC の手続きの要求と応答**で、
  `hello` / `events` / `refresh` のフレームは Event Iterator で届く。購読の元を**取りこぼさず・捨てずに**
  写し、接続が切れたら購読を外す。購読には照合（`rpcGuard`）だけを掛け、断る条件は見ない
- **ブラウザからの書き込みはすべて `/ws` のコマンド**で、`/rpc` に残るのは読み取りだけ。
  診断ログへのブラウザの例外（`diagnostic.reportBrowserError`）と体験の記録への仕切りの離し
  （`experienceMetric.recordSplit`）も、断る条件なしで出力を持たないコマンドとして `/ws` に載る。
  `/ws` の接続が無い間（繋ぐ前・切れている間）に起きた報告は、送らずに捨てる
- ブラウザは型付きの client（`src/browser/stores/session.ts` の `dispatch`）で呼ぶ。**送りっぱなしで、
  断られても画面には出さない**（画面は同じ条件で先に操作子を塞いでいる）
- **`/ws` の上で値を返す手続きは `characterPack.generateFromPortrait` と `workflowSetting.set` の2つだけ。**
  前者は入力の画像が `/rpc` の本文の上限（64 KiB）に入らず、生成した値を返す必要があるため、後者は
  画面からの書き込みで、書いたあとに読み直した欄（か、ワークフローが断った理由）を返す必要があるため。コマンドの契約に `output` を
  持たせ、ブラウザは `dispatchAwaited` で応答を待って受け取る。受け手の行（`write` / `call` / `session`）は
  値を返さないので、機能の表には載せず（表の型から `Omit` で外すか、表を持たない）、`<機能>-procedure.ts` に受け手を直に書く

`/prompt-image/<id>`・`/report-image/<toolUseId>/<path>`（どちらも `<img src>` で読む）と静的な配信は HTTP の経路のまま。

**許す依存の辺**（`test/architecture/layer.test.ts` が見る）:

| 辺                                    | 許す場所                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `shared` → 外部                       | `zod` と `@orpc/contract`（`@orpc/server`・`node:` は読まない）。手続きより前から読んでいる `remeda` も可               |
| `@orpc/server` を import してよい場所 | 機能の `adapter/`（`view-server/adapter/` を含む）と配線（`src/router.ts`）だけ。**`core` と共有の箱は禁止**            |
| `browser` → 外部                      | `@orpc/client`（`/rpc` は `@orpc/client/fetch`、`/ws` は `@orpc/client/websocket`）と `@orpc/tanstack-query`            |
| `src/router.ts`（配線）               | すべての機能の `<機能>-procedure.ts` と、口の型のための `<機能>-command.ts`。配線なので**機能どうしの辺の表は増えない** |
| 機能どうしの辺                        | 上の表のまま（受け手が別の機能の判断を要るようになったら、今と同じく表に足す）                                          |
