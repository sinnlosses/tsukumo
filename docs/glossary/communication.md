# 用語集: 通信（移行後）

ステータス: **正典**。入口は `docs/glossary.md`（用語集の方針と、子のファイルの一覧）。

責務: サーバとブラウザのあいだの通信と共有の契約（共有層・アダプタ・フレーム・コマンド・契約・手続き・セッションの状態・fake driver・疑似セッション）の用語を持つ。
読む時: 通信・共有層・手続きを指す語の表記に迷ったとき。
直す時: この範囲の用語を足す・識別子を変えるとき（用語はこの子に足し、親には足さない）。

## 節の索引

| 節                | 収録している用語                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| ## 通信（移行後） | 共有層 / アダプタ / フレーム / コマンド / 契約 / 手続き / セッションの状態 / fake driver / 疑似セッション |

## 通信（移行後）

2026-09-13 に決めた移行（`docs/architecture.md`）で加わった語。

### 共有層

- **英語識別子**: `shared`（ディレクトリ `src/shared/`）
- **定義**: サーバ（core）とブラウザ（browser）の**両方が import する契約**。イベント・状態・reducer・
  コマンドとフレームの zod スキーマ・`PROTOCOL_VERSION`
- **注記**: `node:` にも `document` にも触らない。zod のスキーマが正典で、型は `z.infer`。
  **ディレクトリ名は 2026-09-20 に `protocol` から `shared` へ改めた**（層の名前を「どの実行環境で
  動くか」に合わせたため。`docs/history/architecture-placement.md`）
- **避ける言い方**: プロトコル（旧称。2026-10-17 に改めた）、共通、API、コントラクト

### アダプタ

- **英語識別子**: `adapter`（ディレクトリ `src/server/adapter/`）
- **定義**: 外の世界（Agent SDK・HTTP/WebSocket・ホスト・ファイル・子プロセス）に触るコードの
  置き場所。**1ファイル = 1つの境界**。判断は持たず、`core` から呼ばれるか `cli.ts` が結ぶ
- **注記**: インターフェースは**実装が2つあるもの（駆動・ホスト）にだけ** `core` に置く
  （`session-driver/core/session-driver.ts` / `host/core/host.ts`）。`core → adapter` の import は
  `test/architecture/layer.test.ts`「層と依存の向き」が落とす
- **避ける言い方**: インフラ層、外界、helpers

### フレーム

- **英語識別子**: `ServerFrame`（`hello` / `events` / `refresh`）
- **定義**: サーバがブラウザへ WebSocket で押す1件。ブラウザが接続ごとに呼ぶ購読の手続き
  `frame.subscribe` の Event Iterator の1件として届く。`hello` は購読の最初の snapshot、`events` は
  まとめたイベント、`refresh` は開発中の取り直しの合図。**コマンドの応答はフレームではない**
  （同じ `/ws` に乗る手続きの応答。下の「コマンド」）
- **注記**: 経路名 `/ws` とトークンのクエリ名は `src/shared/view-server/session-socket.ts` が正典で、
  `adapter` と `browser` は値を再掲しない
- **避ける言い方**: メッセージ（SDK の `SDKMessage` と紛れる）、パケット

### コマンド

- **英語識別子**: 手続きの名前（`session.prompt` / `session.interrupt` / `session.switchCharacter` /
  `characterPack.setPortrait` など31種。形は `src/shared/contract/<機能>.ts`、束は
  `src/shared/rpc.ts` の `commandContract`）
- **定義**: ブラウザがサーバへ送る**書き込みの手続き**。`/ws` の上で oRPC の要求として送り、
  断られたら契約のエラー `REFUSED`（理由は定型文）が応答で返る
- **注記**: **スラッシュコマンド（`/model` など）とは別物。** あちらは `session.prompt` の `text` に
  書く。**どの機能が受け、どの条件で断るかは契約**（断る条件は `meta`）**と機能ごとの表**
  （`src/server/<機能>/core/<機能>-command.ts`。`docs/architecture.md`「コマンドの受け手と手続きの
  置き方」）。2026-09-26 まではコマンドの和 `ClientCommand`（`src/shared/command.ts`）だった
- **避ける言い方**: リクエスト、アクション

### 契約

- **英語識別子**: `contract`（ディレクトリ `src/shared/contract/`）
- **定義**: ブラウザとサーバが取り交わす**手続き1つぶんの形**（入力・出力・エラー・断る条件の `meta`）。
  機能ごとに `src/shared/contract/<機能>.ts` に置き、zod と `@orpc/contract` で書く
- **注記**: 上の「共有層」（`shared` 全体。イベント・状態・reducer も含む）の一部で、そのうち
  **手続きの形だけ**を指す。受け手は含まない（受け手を付けたものが「手続き」）。
  `docs/architecture.md`「コマンドの受け手と手続きの置き方」
- **避ける言い方**: スキーマ（zod の1つを指すときと紛れる）、インターフェース、API

### 手続き

- **英語識別子**: `procedure`（`src/server/<機能>/adapter/<機能>-procedure.ts`）
- **定義**: 契約に受け手を付けたもの。**画面からのコマンドと読み取りのどちらもこれで受ける**
  （oRPC の手続き。全部を束ねるのは配線の `src/router.ts`）
- **注記**: 中身は機能の `core` へ委ねる数行で、判断を書かない。断る条件（雑談の外・ターン中）は
  手続きの中ではなく、契約の `meta` を見る `rpc-guard.ts` が掛ける
- **避ける言い方**: エンドポイント、ハンドラ、コントローラー（手本の語。tsukumo では「受け手」と言う）

### セッションの状態

- **英語識別子**: `SessionState`（移行前は `SessionView`）
- **定義**: イベントを畳んで得た「いま画面に出すべき中身」。サーバとブラウザが**同じ reducer**
  （`applySessionEvent`）で同じ状態を持つ
- **注記**: 時刻はイベントの `at`（サーバの時計）から入る。ブラウザの時計を reducer に渡さない
- **避ける言い方**: セッションの姿（旧称。2026-10-17 に改めた）、ビューモデル、ストア、単独の「状態」（接続中かどうかなどと紛れるので、必ず「セッションの状態」と言う）

### fake driver

- **英語識別子**: `startFakeSession`（引数の型 `FakeDriverOptions`。`TSUKUMO_DRIVER=fake`）
- **定義**: `SessionDriver`（`src/server/session-driver/core/session-driver.ts` の契約）と同じ形で、手で書いた
  疑似セッションどおりにイベントを流す実装（`src/server/session-driver/adapter/fake-driver.ts`）。claude を起こさずに
  画面全体を動かすための道具
- **注記**: 疑似セッションは**架空の会話だけ**（`docs/coding-standards.md`「会話内容の扱い」）
- **避ける言い方**: モック（テストの中の置き換え一般と紛れる）、スタブ

### 疑似セッション

- **英語識別子**: `fakeSession`
- **定義**: fake driver（`src/server/session-driver/adapter/fake-driver.ts`）が流すために手で書いた架空のイベント列
  （`test/fixture/fake-session.json`）。claude を起こさずに画面全体を動かすための材料
- **注記**: 疑似セッションは**架空の会話だけ**（`docs/coding-standards.md`「会話内容の扱い」）
- **避ける言い方**: シナリオ、スクリプト（脚本という含みが強すぎる）
