# アーキテクチャ詳細: shared の機能

ステータス: **正典**。入口は `docs/architecture.md`（全体構造の入口と、子のファイルの一覧）。

責務: `src/shared/` を割る機能の置き場と、機能の決め方・辺の規則を持つ。
読む時: `src/shared/` にファイルを足すとき、どの機能に置くか迷ったとき。
直す時: shared の機能の置き方・辺の規則を変えたとき（一覧と辺は `test/architecture/shared-feature.test.ts` が見る）。

## 全体構成

### shared の機能

`src/shared/` も**機能のまとまりで割る**。**機能の名前は `src/server/` の機能の名前をそのまま使い**
（同じ語彙の判断・境界・形が同じ名前の下に並ぶ）、**サーバに無い名前の機能は作らない**。`shared` は
1つの層なので、機能の中は層で割らずファイルを平らに置き、サブディレクトリを作らない。置く物の無い
機能（`system-prompt` `host` など）のディレクトリは作らない。

| 置き場                      | 置くもの                                                                                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/<機能>/`            | その機能の語彙（型・検証・純粋な導出）と、その機能だけが動かす `SessionState` の欄の畳み方（「SessionState」）                                                                                                                                               |
| `shared/session/`           | `SessionEvent` / `SessionState` / `applySessionEvent` と、**`SessionState` から純粋に導くだけのもの**（`main-view.ts` `turn-step.ts` `portrait-motion.ts` など）。サーバの `session/` と同じく**各機能の語彙を束ねる**ので、ほかの機能を読む向きの辺が集まる |
| `shared/` の直下            | **どの機能にも属さないプロトコル**だけ: フレームの封筒（`frame.ts`）・コマンドの共通の形（`command.ts`）・手続きの束（`rpc.ts`）                                                                                                                             |
| `shared/contract/<名前>.ts` | 手続きの契約。**名前は手続きの名前**（`rpc.ts` の鍵と `<名前>-procedure.ts`）で、機能の名前とは1対1でないので機能のディレクトリへは寄せない                                                                                                                  |
| `shared/utils/` `lib/`      | tsukumo の語彙を名乗らない道具（「`lib/` と `utils/` に置く基準」）                                                                                                                                                                                          |

**機能の決め方**（上から順に当てる。数えるのはファイル名と import で、読み手の数は数えない）:

1. **サーバのある機能が同じ語彙を持つなら、その機能**。手がかりは、サーバのその機能に同じ名前の
   ファイルがある（`view-server/adapter/session-socket.ts` → `shared/view-server/`）・ファイル名が
   機能の名前で始まる（`report-block.ts` → `shared/report/`）・サーバでその値を組み立てる（外から来た
   値を検証して型にする）のがその機能（`api-trouble.ts` は SDK のメッセージを畳む `session-driver`）
2. 手がかりが食い違ったら、**shared の機能どうしの辺が輪にならないほう**（`character-diary-font.ts` は
   `character-definition.ts` が読むので、`diary` ではなく `character-pack`）
3. 1に当たらず、`SessionState` / `SessionEvent` から導くだけのものは `session/`
4. tsukumo の語彙を名乗らない道具は `utils/`（歯止めの3つを満たすもの）、残る封筒と束は直下

**辺の規則**:

- **shared の機能どうしの辺は輪にしない**（`session/` が束ね、ほかの機能は `session/` を読まないのが
  既定。雑談のログ `chat/chat-log.ts` のように `SessionState` から導く機能の語彙は `session/` を読んでよい）。
  サーバのような「読んでよい機能」の表は持たない（層が1つで、辺の向きは輪が無いことだけで決まる）
- **機能のディレクトリは `contract/` と `rpc.ts` を読まない**（契約と束が機能の語彙を読む一方向）。
  直下の `frame.ts` `command.ts` は機能から読んでよい（断る理由 `FRAME_ERROR_REASON` と、権限・モデル・
  思考の段の語彙を持つため）
- **機能を足すときは、サーバの機能の一覧に先にあること**。shared の機能の一覧・直下のファイルの一覧・
  機能どうしの輪は `test/architecture/shared-feature.test.ts` が見る

**ブラウザ側とは対応させない。** `src/browser/` は画面と領域（「`src/browser/` の箱と、置く基準」）で割り、
shared の機能の名前には揃えない。ブラウザの部品は要る語彙を `shared/<機能>/<概念>.ts` から直に
import する。**`browser/features/` の「機能」は置かれる機能（「領域の機能と、置かれる機能」）で、
サーバと shared の機能とは別の語**。
