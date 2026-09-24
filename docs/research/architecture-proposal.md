# アーキテクチャ提案: 3層は変えず、サーバ側を「判断」と「境界」に割る（2026-09-15）

**この文書は提案であって正典ではない。** `docs/` の他ファイルにある「節の索引」はここには作らない。
採用したら正典（`docs/design.md` 2章・`docs/architecture.md` 原則2/3・`docs/coding-standards.md`
「層と依存の向き」・`docs/glossary.md`）へ反映し、この文書は経緯として `docs/research/` に残す。

**対象コミット**: `main` の `5a89117`。**書き方**: `~/.claude/skills/architecture-proposal`
の手順（性質 → 候補 → 木 → 差分 → 段階）。無人の試運転2回（`docs/history` には残さない）の結果を、
ユーザーへの4つの質問の答え（下の「決めてもらったこと」）で確定させたもの。

**結論（3行）**

1. **性質**: Agent SDK の子プロセスからイベントが流れ込む**常駐プロセス**で、同一言語の**2つの実行環境**
   （サーバとブラウザ）が同じ reducer で同じ状態を持つ。サーバ側で外の世界に触るファイルは
   **17 のうち 9**（6系統）。利用者は作者1人で、タスクはサブエージェントに委譲する運用。絵は目視で守る
2. **様式**: いまの「共有契約（`protocol`）+ サーバ（`core`）/ クライアント（`ui`）」は性質から直接出る形で
   **変えない**。変えるのはサーバ側の中だけで、**`core` を「純粋な判断」に絞り、外の世界に触る 9 ファイルを
   `adapter/` に出す**。`protocol` の入場基準は「両側の契約 + `SessionState` から純粋に導けるもの」に固定し、
   正典の文言を1本にする
3. **最初の段階**: ファイルを1つも動かさず、`test/architecture.test.ts` に「SDK・子プロセス・環境変数は
   このファイルだけ」「`protocol` は `document` にも触らない」「`ui/` 直下は領域か共有かのどちらか」
   「経路名は `protocol` 以外に書かない」の検査を足し、`/ws` の再掲を `protocol` に1つにし、
   消えた旧パスを指すコメント 15 件を掃除する

**決めてもらったこと（2026-09-15、ユーザーの回答）**

| 問い                                        | 答え                                       | この提案での扱い                                                                                      |
| ------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `protocol` の入場基準                       | 契約 + `SessionState` から純粋に導けるもの | `main-view.ts` / `turn-speech.ts` / `portrait-motion.ts` は **動かさない**。正典の文言をこの1本に直す |
| 境界のディレクトリ名                        | `adapter`                                  | `docs/architecture.md` と用語集が既に使っている語。用語集に項目を足す                                 |
| `core` の中で外に触るファイルが探しにくいか | 感じている                                 | 検査だけ（候補 A）で止めず、`adapter/` を切る段まで提案に含める                                       |
| 箱（Orca のタブ）の差し替え                 | 当面 Orca のまま                           | 差し替えは `adapter/` の中で閉じる前提。段には入れない                                                |

---

## 1. アプリの性質

| 軸               | 読み取ったこと                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 根拠                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 何を中心に回るか | **イベント流入型の常駐プロセス**。`cli.ts main()` → `session-manager.create()` → `session-driver.ts` が SDK の `query()` を回し `sdk-message.ts` で `SessionEvent` に変換 → `session-manager` が `applySessionEvent` で畳んで `events` フレームで配る → `ui/socket.ts` → `ui/app.tsx` の `useReducer` が**同じ `applySessionEvent`** で畳む → React が描く。逆向きは `ClientCommand` → `session-manager.dispatch()` の1箇所                                                                                                                                                                                           | `src/cli.ts` 76–235行、`src/core/session-manager.ts`、`src/ui/app.tsx`、`docs/design.md` 3章                                                        |
| 外の世界との境界 | サーバ側 **6系統・9ファイル**: (1) Agent SDK（`session-driver.ts`）、(2) HTTP + WebSocket（`server.ts`）、(3) ホスト `orca`（`orca-host.ts`）、(4) ファイル: `characters/`（`character-pack.ts`）・`develop/tasks.json`（`task-summary.ts`）・`~/.tsukumo/state.json`（`remembered-character.ts`）・fake driver（`fake-driver.ts`）・同梱物の位置（`bundled-path.ts`）、(5) `bun build` の子プロセス（`bundle.ts`）、(6) 環境変数（`process.env` を読むのは `cli.ts:83` の1箇所。`config.ts` は引数で受ける）。**「画面から作ったパックを `~/.tsukumo/characters/<name>/` に書く」境界が1つ増えることが決まっている** | `grep -lE 'from "(node:\|@anthropic-ai\|ws")' src/core/*.ts` → 9件、`grep -rn process.env src` → `cli.ts:83` のみ、`develop/tasks.json` の evidence |
| 状態の持ち方     | **メモリだけ**。`SessionState` をサーバとブラウザが同じ reducer で持ち、再接続は `hello` の snapshot で置き換える。会話はディスクに書かない。復元は claude の transcript を読み直して再生。ディスクに書くのは覚えたキャラクター名1つ                                                                                                                                                                                                                                                                                                                                                                                  | `src/core/session-manager.ts`、`src/core/remembered-character.ts`、`docs/design.md` 9章                                                             |
| 実行環境の数     | **2つ・同一言語**。`protocol` は両方で読まれるので `node:` にも `document` にも触れない（物理的制約）。「TypeScript は本質、Bun は非本質」と決定済み。Electron 等の3つ目は当面来ない（上の回答）                                                                                                                                                                                                                                                                                                                                                                                                                      | `docs/design.md` 1章・2章、`package.json`                                                                                                           |
| 変わりやすい場所 | 移行完了（2026-09-13）後のコミットで触った延べ数は **ui 49 / protocol 17 / core 14 / cli.ts 5**。単一ファイルの上位は `protocol/session-state.ts`（6）・`cli.ts`（5）。残タスクの重心は3つ: **パックの書き込み**（新しい境界）、**「何を出すか」の判断**（`protocol` の純粋関数）、**箱とスタンドアロン**                                                                                                                                                                                                                                                                                                             | `git log --since=2026-09-13 --format= --name-only -- src \| sort \| uniq -c \| sort -rn`、`develop/tasks.json` の `todo`                            |
| 守られている制約 | `test/architecture.test.ts` が落とすのは **層の辺**（`protocol→protocol` / `core→protocol,core` / `ui→protocol,ui` / `cli→全部`）、`protocol` の `node:` import、`ui/<領域>/` 同士の import。**「SDK はここだけ」「`orca` はここだけ」「`process.env` はここだけ」はコメントにしかない。`document` の禁止はテスト名にあるが実装が無い**（`/from\s+["']node:/` しか見ていない）                                                                                                                                                                                                                                        | `test/architecture.test.ts` 14–19行・43–48行、`src/core/session-driver.ts` 冒頭、`src/core/orca-host.ts`、`src/core/config.ts:1`                    |
| 利用者と開発体制 | **作者1人**。タスクは `difficulty` と同じモデルのサブエージェントに委譲し `/loop /next-task` で回す。**ディレクトリ名と `architecture.test.ts` が委譲先への指示書の代わり**になる                                                                                                                                                                                                                                                                                                                                                                                                                                     | `CLAUDE.md`「進捗管理とHandoff」、`docs/workflow.md`                                                                                                |
| テストできる範囲 | 452 件（2026-09-15）。`protocol` は純粋関数、`core` は境界ごと（`server.test.ts` は本物の `listen`、`session-manager.test.ts` は fake driver）、`ui` は happy-dom。**絵は目視**。**`cli.ts` は起動の前提チェックまでしか守れず、そこにある判断（パックの選択順位・復元の可否・履歴の再生）は未テスト**                                                                                                                                                                                                                                                                                                                | `test/` の木、`test/cli.test.ts` 冒頭                                                                                                               |

### 現状の依存の辺

```bash
python3 ~/.claude/skills/architecture-proposal/scripts/import_edges.py src --markdown
```

| 単位       | ファイル数 |  行数 |
| ---------- | ---------: | ----: |
| `cli.ts`   |          1 |   335 |
| `protocol` |         14 | 1,976 |
| `core`     |         17 | 2,870 |
| `ui`       |         40 | 3,331 |

| from     | to         | 本数 |
| -------- | ---------- | ---: |
| `cli.ts` | `core`     |   14 |
| `cli.ts` | `protocol` |    2 |
| `core`   | `protocol` |   24 |
| `ui`     | `protocol` |   29 |

循環なし。`core` と `ui` の間の辺は 0。外部 import は `core → @anthropic-ai/claude-agent-sdk` 1、
`core → ws` 1、`core → node:child_process` 2、`core → node:fs` 5、`protocol → zod` 4、`ui → react` 30。

`core` の中の辺（`grep 'from "\./' src/core/*.ts`）は 11 本で、**純粋なファイルから境界のファイルへの辺は
`型だけ` の2本**（`session-manager → session-driver` と `fake-driver → session-driver` は `type SessionDriver`
のみ）。これが「`core` を割れる」根拠になる（3章）。

### いま痛んでいる兆候

1. **`protocol` の定義が正典の中で2通りに読める。** `docs/design.md` 2章は「両側から見える最小限」、
   `docs/architecture.md` 原則2は「『決める』を `protocol` の純粋な畳み込みに」。実態は `main-view.ts` /
   `turn-speech.ts` / `portrait-motion.ts` が ui からしか import されていない一方、`session-state.ts` 自身が
   `mainViewEntries` / `currentExpression` / `commandSuggestions` という ui 専用の派生を持つ。
   `ui/component/tool-summary.ts` は一度 `protocol` に置いてから ui へ戻している。
   **→ 基準は決まった（「契約 + `SessionState` から純粋に導けるもの」）。直すのは正典の文言**
2. **「ここだけが外に触る」がコメントにしかない。** SDK・`orca`・`process.env` の約束は各ファイルの冒頭に
   あるが、テストは辺しか見ない。`protocol` の `document` 禁止も名前だけ
3. **経路名の再掲。** `SESSION_SOCKET_PATH = "/ws"` が `core/server.ts:39` と `ui/socket.ts:14` に2つある
   （`ui/socket.ts` のコメント自身が「旧のやり方の踏襲」と認めている）。`/character/` と `/vendor/` は
   `protocol` に置いてあるので、置き場所が揺れている
4. **配線の `cli.ts`（335行）に判断が溜まっている。** 冒頭に「判断そのものは持たない」と書きながら、
   パックの選択順位（環境変数 > 覚えた値 > 同梱の既定。`selectPack` 130–138行）、`findPackSessionToResume`
   （271行）、`replayRestoredSession`（289行）、駆動の種類の分岐を持ち、**どれも未テスト**。
5. **消えたディレクトリを指すコメントが 15 箇所**（`grep -rn "src/presentation" src`）。委譲された
   エージェントが存在しないファイルを探しに行く
6. **`ui/` 直下の分類が暗黙。** `ui/appearance/` は領域と同じ形だが `UI_REGIONS` に無いので「誰から引いても
   よい共有部分」として通っている。新しいディレクトリを足しても、領域か共有かをどこにも書かずに通る
7. **`core` の 17 ファイルが平らで、どれが外に触るかが名前に出ない。** 9 / 17 が境界で、今後さらに増える。ユーザーは探しにくさを実際に感じている（上の回答）
8. **正典どうしで箱（実行環境）の想定が食い違う**（兆候1と同じ種類の食い違いが、層ではなく実行環境の
   側にもある。2026-09-16 追記）。`docs/design.md` 1章は「**Electron なら core を Electron の Node で
   動かせるので Bun は不要になる**」と書き、箱の方針のタスクの依頼文は「**Bun のプロセス（駆動＋ビューサーバ）を
   子として起こし、`BrowserWindow` で開くだけで済む見込み**」と書く。`docs/research/app-shell.md` の
   比較表は7軸の2つ目に「Bun プロセスを子として起こせるか・同梱」を置いており、**後者の前提で
   書かれている**。どちらを採るかで「Bun 固有の API に寄せてよいか」の答えが逆になるので、
   規約（`docs/coding-standards.md`「Bun固有APIに寄せない」）の扱いもここに従属する。
   **この提案の層の形はどちらでも変わらない**（`adapter/` の中で閉じる）が、規約の文言を直すときは
   先にこの食い違いを解く。関連: `docs/research/hono-server.md`、同「箱の仕事の大きさは、tsukumo 側の
   形で変わる」節

## 2. 候補と選択

**土台は動かさない。** 「共有契約 + クライアント/サーバ分割」は「実行環境が2つ・同一言語・両側が同じ reducer を
回す」という性質から直接出る形で、`docs/research/architecture-rethink.md` が採らなかった案（サーバが HTML を作る
一族・言語を分ける案）とも整合する。その中で既に「受け取る（`core`）→ 畳む（`protocol`）→ 描く（`ui`）」の
イベント駆動と、キャラクターパックのプラグイン形を採っている。候補は**土台の中の割り方と守り方**で立てる。

### 候補 A: 現状維持 + 検査だけ足す

- 効く性質: 「守られている制約」— 兆候 2・3・5・6 をファイルを動かさずに `architecture.test.ts` で落とせる。
  「利用者と開発体制」— 委譲先が破ってもチェックが赤になる
- 合わない点と補い方: 兆候 7（探しにくさ）に効かない。2026-09-12 に同じ理由（探しにくさが残る）で退けられた案
  でもある。**補い方: 候補 B の第1段階として採る**
- 要求する形: いまの木のまま
- 確度: **固い**

### 候補 B: `core` を「判断」に絞り、外の世界に触るファイルを `adapter/` へ

- 効く性質: 「外の世界との境界」— 9 ファイル・6系統あり、**書く境界が今後増える見込み**。
  「利用者と開発体制」— 「境界はこのディレクトリ」と言えるだけで、委譲先の置き場所の問いが消える
  （今後増える境界のファイル書き込みと WebSocket の `maxPayload` は `adapter`、名前の検証や必須表情の判定は
  `core` / `protocol`、と機械的に決まる）。「テストできる範囲」— `core` に `node:` / SDK / `ws` の import を
  禁じる検査が**1行で書ける**（`protocol` の検査と同じ形）
- 合わない点と補い方: ポートとアダプタの様式が要求する「境界ごとのインターフェース」は儀式になる
  （実装が2つある境界は駆動と ホストの2つだけ）。**補い方: インターフェースは切らない。** 既に2実装ある
  ものだけ型を `core` に残し、他は置き場所だけで境界を表す。`core → adapter` の辺を禁じれば、型無しでも
  向きは守れる。層は 3 → 4 になるが、境界の数（6系統 + 増える1）と実行環境の数（2）から逆算した結果で、
  旧4層（役割で切る）の復活ではない
- 要求する形: `src/protocol` / `src/core`（純粋）/ `src/adapter`（境界）/ `src/ui` / `cli.ts`
- 確度: **固い**（性質の表とユーザーの回答から直接出る）

### 候補 C: `core` を概念で縦切り（`core/session/` `core/character-pack/` …）

- 効く性質: 探しやすさ。`ui/<領域>/` が縦切りで成功しているのと同じ形をサーバ側に当てる。`core` 内の辺 11 本の
  うち概念をまたぐのは `server → session-manager` と `* → bundled-path` だけ
- 合わない点: 兆候 2・7 を解かない。`core/session/` の中に `session-driver`（SDK）と `session-manager`（純粋）が
  並ぶので、どれが外に触るかは相変わらず開いて読む。17 ファイルを 5 概念に割ると 1 概念あたり 2〜4 ファイルで、
  「ディレクトリを増やして解決した気になる」側に近い。**B の後、`adapter/` の1系統に 3 ファイル以上が付いたら、
  その系統だけ概念のサブディレクトリにする**（7章）
- 確度: 却下（時期尚早）

### 候補 D: `protocol` を「両側が import するものだけ」に絞る

- 効く性質: 「実行環境の数」— `protocol` の存在理由に基準を1本化できる。動くのは3ファイル
- 合わない点: `session-state.ts` 自身が ui 専用の派生を持つので、3ファイルだけ動かすと基準が二重になる。
  派生3関数まで ui へ動かすと、reducer の隣にあった「状態から導く」関数が層をまたぐ。こうした派生関数の置き場所も「両側で同じ答えが要るか」で毎回判断することになる
- 確度: 却下（**ユーザーの回答で基準は「契約 + `SessionState` から純粋に導けるもの」に決定**）

### 選んだもの: A を第1段階にして B

- **A は無条件に採る**（段1）。動かさずに価値が残り、B を進めるときの安全網になる
- **B を採る理由**は性質の表の4点: 境界が 9 ファイル・6系統で今後も増える、2実装のシームが既に2つある、
  残タスクが境界の上に乗っている、委譲する体制ではディレクトリ名が指示書になる。ユーザーが探しにくさを
  実際に感じている（回答）ことで、A で止める理由が消えた
- **C を捨てた理由**: 境界の問題を解かず、ファイル数に対してディレクトリが多すぎる
- **D を捨てた理由**: 基準がユーザーの回答で決まった。正典の文言を直せば兆候 1 は消える

## 3. 目標のディレクトリ構造

「住むもの」「置いてはいけないもの」を1行ずつ。★は現状から変わる場所。

```
src/
  cli.ts                  配線。環境変数を core/config へ渡し、adapter と core を結ぶ唯一の場所
                          住む: 起動順序・前提チェック・終了処理・1回分の try/catch
                          置かない: 判断（パックの選択順位・復元の可否・履歴の再生）★ → core へ
  protocol/               両側が共有する契約と、SessionState から純粋に導けるもの
                          住む: SessionEvent / SessionState / applySessionEvent / ClientCommand / ServerFrame /
                                語彙（character, expression, question, pending-ask, task-summary, utterance）/
                                派生（main-view, turn-speech, portrait-motion。いまのまま）/ vendor-asset /
                                session-socket ★（/ws とトークンのクエリ名。core と ui の再掲を1つに）
                          置かない: node: / document / window / localStorage / React / SDK の型。片側の描画の都合
  core/                   サーバ側の純粋な判断。外の世界に触らない
                          住む: session-manager / pending-answer / sdk-message / session-restore / port-resolution /
                                config（渡された env を読むだけ）/ report-notation / host（ポートの型）/
                                session-driver（駆動の契約の型と既定値だけ）★ /
                                session-launch ★（cli.ts から移す「起こす一続き」）/
                                character-selection ★（cli.ts から移す初期パックの順位）
                          置かない: node: の import、SDK / ws / child_process、process.env / import.meta.url。
                                adapter の import
  adapter/ ★              外の世界に触る場所。1ファイル = 1つの境界。インターフェースは切らない
                          住む: sdk-driver（Agent SDK。旧 session-driver の実装部）/ fake-driver（疑似セッションの fs）/
                                server（http + ws）/ bundle（bun build）/ bundled-path（import.meta.url）/
                                orca-host / character-pack（fs）/ remembered-character（home の fs）/
                                task-summary（cwd の fs）/ ── 今後足す ── character-pack-writer（home の fs）
                          置かない: 判断（優先順位・既定への落とし方・イベントの畳み込み）。ui の import。
                                会話の内容をディスクやログへ出す経路
  ui/                     ブラウザ側。変更なし（領域の縦切り + 共有部分 + 横断 import 禁止のまま）
                          appearance/ を「共有」としてテストの表に明記 ★
test/
  architecture.test.ts    層の検査。辺を 4 層 + cli に増やし、限定と分類の検査を足す ★
  protocol/ core/ adapter/ ui/   src/<相対パス> → test/<相対パス>.test.ts の対応はそのまま（動いたファイルは追随）
  fixture/                fake driver の疑似セッション（架空の会話）
characters/ vendor/ scripts/ bin/   変更なし
```

### 許す依存の辺

| from       | import してよい先             | 備考                                                                         |
| ---------- | ----------------------------- | ---------------------------------------------------------------------------- |
| `protocol` | `protocol`、`zod`             | 変更なし。`node:` に加えて `document` / `window` / `localStorage` も落とす ★ |
| `core`     | `protocol`、`core`            | **新: `node:` / `@anthropic-ai/*` / `ws` を import しない** ★                |
| `adapter`  | `protocol`、`core`、`adapter` | 境界のファイル同士（`server → bundled-path` など）は可 ★                     |
| `ui`       | `protocol`、`ui`、npm         | 変更なし。`UI_REGIONS` の外は `UI_SHARED` に必ず載る ★                       |
| `cli.ts`   | すべて                        | 変更なし                                                                     |

`test/architecture.test.ts` の変更: `Layer` に `adapter` を足し、`ALLOWED_IMPORTS` を上の表にする
（`layerOf` は先頭ディレクトリで判定しているので `adapter` を足すだけ）。「`protocol` は `node:` に触らない」の
`it` を「`protocol` と `core` は `node:` / SDK / `ws` に触らない。`protocol` は `document` にも」に広げる。
限定の検査を足す: SDK の import は `adapter/sdk-driver.ts` だけ、`node:child_process` は `adapter/orca-host.ts` /
`adapter/bundle.ts` だけ、`process.env` は `cli.ts` だけ、経路名のリテラル（`"/ws"` `"/character/"` `"/vendor/"`）は
`protocol` だけ。

現状と目標の辺（`cli` は省略）:

```
いま:   core ──▶ protocol ◀── ui          （core の中に境界 9 / 判断 8 が混在）
目標:   adapter ──▶ core ──▶ protocol ◀── ui   （core → adapter は禁止。ui は変更なし）
```

### 名前について

- **`adapter`**: `docs/architecture.md` 原則3と「ホスト依存の操作は1つのポートにまとめる」、`docs/glossary.md`
  「ホスト」の注記が既に「アダプタ」を使っている。用語集「通信（移行後）」の節に足す文面案:
  **「### アダプタ — 英語識別子 `adapter`（`src/adapter/`）— 定義: 外の世界（Agent SDK・HTTP/WebSocket・ホスト・
  ファイル・子プロセス）に触るコードの置き場所。1ファイル = 1つの境界。判断は持たず、`core` から呼ばれるか
  `cli.ts` が結ぶ。インターフェースは実装が2つあるもの（駆動・ホスト）にだけ `core` に置く。
  — 避ける言い方: インフラ層、外界、helpers」**
- **`protocol/session-socket.ts`**: `attachSessionSocket`（core）と `connectSessionSocket`（ui）が既に使っている
  識別子。用語集「フレーム」の隣に注記を足す: **「経路名 `/ws` とトークンのクエリ名は
  `protocol/session-socket.ts` が正典で、`core` と `ui` は値を再掲しない」**
- **`core/session-launch.ts`**: 文面案: **「### セッションを起こす — 英語識別子 `launchSession` — 定義: パックを
  決めて続きのセッションを探し、駆動を起こし、復元した履歴と `character-changed` を流すまでの一続き。
  — 避ける言い方: 起動（プロセスの起動と紛れる）、ブート」**
- **`core/character-selection.ts`**: 初期パックの順位（環境変数 > 覚えた値 > 同梱の既定）と「知らない名前は
  既定へ落とす」の純粋関数。`character-pack` と分けるのは、あちらが fs を読む境界（`adapter`）だから
- `adapter` の中は平らにする。`session/` や `character-pack/` のサブディレクトリは、1系統に 3 ファイル以上が
  付いてから（7章）。単数形は既存の慣習どおり

## 4. 現状との差分

| 動き     | いま                                                                                                              | 目標                                                                                                                                                                                                                          | 段  |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 書き換え | `test/architecture.test.ts`                                                                                       | 限定・分類・`document` の検査を足す（辺はまだ増やさない）                                                                                                                                                                     | 1   |
| 新規     | —                                                                                                                 | `src/protocol/session-socket.ts`（`/ws`・トークンのクエリ名）                                                                                                                                                                 | 1   |
| 書き換え | `src/core/server.ts:39`、`src/ui/socket.ts:14` の同名定数                                                         | `protocol/session-socket.ts` を import                                                                                                                                                                                        | 1   |
| 書き換え | `src/` の旧パスを指すコメント 15 箇所                                                                             | 現在のパスに直すか消す                                                                                                                                                                                                        | 1   |
| 書き換え | `docs/architecture.md` 原則2、`docs/design.md` 2章・4章                                                           | 「決めるを `protocol` に」→「両側の契約 + `SessionState` から純粋に導けるものを `protocol` に」                                                                                                                               | 1   |
| 移動     | `src/core/{fake-driver,server,bundle,bundled-path,orca-host,character-pack,remembered-character,task-summary}.ts` | `src/adapter/` に同名で `git mv`                                                                                                                                                                                              | 2   |
| 分割     | `src/core/session-driver.ts`（463行）                                                                             | 型と既定値（`SessionDriver` / `SessionDriverOptions` / `DEFAULT_*`）は `core/session-driver.ts` に残し、`startSession` / `buildQuerySeedOptions` / `findSessionToResume` / `readRestoredEvents` を `adapter/sdk-driver.ts` へ | 2   |
| 移動     | `test/core/{上の8件 + session-driver の実装分}.test.ts`                                                           | `test/adapter/`                                                                                                                                                                                                               | 2   |
| 書き換え | `test/architecture.test.ts`                                                                                       | `Layer` に `adapter`、`ALLOWED_IMPORTS` を3章の表に、`core` の `node:` / SDK / `ws` 禁止                                                                                                                                      | 2   |
| 書き換え | `src/cli.ts` の import（`core` からの 14 本のうち 9 本: 境界の 8 ファイル + `startSession` を `sdk-driver` から） | `./adapter/...` へ                                                                                                                                                                                                            | 2   |
| 書き換え | `docs/design.md` 2章の図と表、`docs/coding-standards.md`「層と依存の向き」、`docs/glossary.md`                    | 4層 + cli の形に。用語集に「アダプタ」                                                                                                                                                                                        | 2   |
| 新規     | —                                                                                                                 | `src/core/session-launch.ts`（`cli.ts` 161–209行の `startDriver` クロージャの中身と 247–303行の `startDriver` / `findPackSessionToResume` / `replayRestoredSession`）                                                         | 3   |
| 新規     | —                                                                                                                 | `src/core/character-selection.ts`（`cli.ts` 119–139行の順位と `selectPack`）                                                                                                                                                  | 3   |
| 縮小     | `src/cli.ts`（335行）                                                                                             | 配線だけ（目安 150 行以下）                                                                                                                                                                                                   | 3   |
| 新規     | —                                                                                                                 | `test/core/session-launch.test.ts`、`test/core/character-selection.test.ts`                                                                                                                                                   | 3   |

**動かさないもの**: `protocol` の全ファイル（`main-view` / `turn-speech` / `portrait-motion` を含む）、
`core` の純粋な 8 ファイル（`session-manager` / `pending-answer` / `sdk-message` / `session-restore` /
`port-resolution` / `config` / `report-notation` / `host`）、`ui/` の全部、`test/` の配置規則、
`characters/` `vendor/` `scripts/` `bin/`。

## 5. 移行の段階

各段は単独で `bun run check` が通る。段1で止めても検査と正典の統一で兆候 1・2・3・5・6 が消える。

| 段                                             | やること                                                                                                                                                                                                                                                                                                   | 終わったと分かる証拠                                                                                                                                                                                                                                                                              | 確度         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **1** 検査と再掲の掃除（ファイルを動かさない） | `architecture.test.ts` に「SDK・子プロセス・`process.env` の限定」「`protocol` の `document` 等」「`ui/` の分類（`UI_SHARED`）」「経路名の再掲」を足す。`protocol/session-socket.ts` を作り `core/server.ts` と `ui/socket.ts` から引く。旧パスのコメント 15 件を直す。正典の `protocol` の文言を1本にする | `bun run check` が通り、`architecture.test.ts` の `it` が 3 → 7。`grep -rn "src/presentation" src` が 0 件。`grep -rn '"/ws"' src` が `protocol/session-socket.ts` の1件。`docs/` の `## / ###` の数が前後で同じ                                                                                  | 固い         |
| **2** `adapter/` を切る                        | 8 ファイルを `git mv`、`session-driver.ts` を型と実装に分割、テストを追随、`Layer` に `adapter` を足して `core` の `node:` / SDK / `ws` 禁止を有効化。正典と用語集を更新                                                                                                                                   | `bun run check` が通る（件数は変わらない）。`import_edges.py src --markdown` で `core → adapter` が 0、`adapter → core` が出る。`grep -l 'from "node:' src/core/*.ts` が 0 件。fake driver で1往復し、レイアウトページで吹き出しとレポートが出る（`docs/architecture.md`「手で確かめること」）    | 固い         |
| **3** `cli.ts` の判断を `core` へ              | `core/session-launch.ts` に起こす一続きを、`core/character-selection.ts` に順位を移す。`cli.ts` は読む・組み立てる・つなぐだけ                                                                                                                                                                             | `test/core/session-launch.test.ts` が fake driver で「続きから始まった印が流れる」「再生が失敗しても駆動は動き続ける」を通し、`character-selection.test.ts` が「知らない名前は既定」「環境変数 > 覚えた値」を通す。`cli.ts` が 150 行以下。本物の駆動で起動し、前回のキャラクターで続きから始まる | 試す価値あり |

段2と段3は独立で、順序を入れ替えられる。パックの書き込みを先にやるなら、その書き込みは
`adapter/character-pack-writer.ts` に置く前提で段2を先に済ませたほうが置き場所の問いが消える。

## 6. 採らなかった案

- **旧4層（domain / usecase / presentation / infrastructure）への回帰**: 2026-09-13 に捨てた案（`docs/design.md`
  1章）。実行環境が2つある性質に「役割の分割」は合わない。今回の `core` / `adapter` は「実行場所で切った上で、
  サーバ側だけを純粋か境界かで割る」ものであり、`usecase` 層の復活ではない（`cli.ts` は配線のまま）
- **境界ごとにインターフェースを切る（教科書的なヘキサゴナル）**: 実装が2つある境界は駆動とホストの2つだけ。
  `docs/architecture.md`「ホスト依存の操作は1つのポートにまとめる」が `codebase-design` の戒めを意図的に外して
  いるのは「ユーザーが2つ目を実際に見込んでいる」からで、fs や `bun build` にその見込みは無い
- **`core` を概念で縦切り（候補 C）**: 2章のとおり。`adapter/` の1系統が3ファイル以上になったら、その系統だけ
- **`protocol` を両側 import だけに絞る（候補 D）**: ユーザーの回答で基準が決まった
- **`ui` を状態管理ライブラリ入りの MVU に組み直す**: `docs/design.md` 6.2「zustand などは入れない」。
  変える理由が性質に無い
- **言語・ランタイム・フレームワークの変更**: `docs/research/architecture-rethink.md`「採らない案」。
  Bun → Node の寄せ替えは箱の方針の判断に従属する
- **`scripts/open-views.ts` が `core` / `adapter` を import するのを禁じる**: `scripts/` は本体から呼ばれない道具。
  辺の検査の対象外のまま

## 7. 未決事項

ユーザーの回答で決まったもの（冒頭の表）は除く。以下は**仮定**として置く。

| 仮定                                                                                                                                                                                                                                                        | 外れたときに変わる箇所                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`fake-driver.ts` は `adapter`**（疑似セッションを fs から読むため）。テストは `test/adapter/fake-driver.test.ts` へ                                                                                                                                       | 「fake driver は境界ではなく `core` の道具」と見るなら `core` に残し、fs を読む部分（`readFakeScript`）だけ `adapter` に出す。段2の移動対象が 8 → 7                                                                                                                                                                                                     |
| **`character-pack.ts` はファイルごと `adapter`**。中の純粋な部分（`characterChangedEvent` / `buildSystemPromptAppend` / `toCharacterPackChoices`）は分けない                                                                                                | 分けるなら `core/character-pack.ts`（純粋）と `adapter/character-pack.ts`（fs）。**この層の中の割り方は `codebase-design` で別途設計する**                                                                                                                                                                                                              |
| **段3の `session-launch.ts` は `switch-character` の起こし直し（`session-manager.restart`）も同じ関数で通す**                                                                                                                                               | `restart` が「画面を初期状態に戻す」判断を持つので、そこは `session-manager` に残す。境目は実装時に決める                                                                                                                                                                                                                                               |
| **`adapter/` のサブディレクトリは当面作らない**。`character-pack-writer` が加わっても 2 ファイル                                                                                                                                                            | パックの系統が 3 ファイル以上（読む・書く・覚える・検証）になったら `adapter/character-pack/` を切る。`core` 側の `character-selection` はそのまま                                                                                                                                                                                                      |
| **事前ビルド化の結論で `bundle.ts` の中身は変わるが置き場所は変わらない**（「起こす」から「同梱物を読む」へ）                                                                                                                                               | なし（`adapter` の中で閉じる）                                                                                                                                                                                                                                                                                                                          |
| **箱の方針をどう選んでも、この提案の層の形は変わらない**と仮定。兆候8 の食い違いを「Bun のプロセスを子として起こす」側で読み、`Bun.serve` / `bun build --compile` を採っても影響は `adapter/server.ts` と `adapter/bundle.ts` の2ファイルに閉じると見ている | 「core を Electron の Node で動かす」側を採るなら、`adapter/` の中身は `node:` に寄せたまま保つ必要がある（層の形は変わらないが、規約の文言が変わる）。`docs/coding-standards.md`「Bun固有APIに寄せない」を**撤回するのではなく「境界のファイルだけは寄せてよい」に狭める**案は、段2の後でないと書けない（境界が1ディレクトリに集まっていることが前提） |
| **複数セッション（`docs/design.md` 8章）は当面来ない**                                                                                                                                                                                                      | 来ても `session-manager` が鍵を持っているので層の形は変わらない                                                                                                                                                                                                                                                                                         |

---

次の一手: 段1（ファイルを動かさない）を `develop/tasks.json` に1件、段2と段3をそれぞれ1件として起こす。
選んだ候補を問い詰めたいなら `grilling`。
