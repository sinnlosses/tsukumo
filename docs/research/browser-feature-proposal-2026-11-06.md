# アーキテクチャ提案: ブラウザ側の `features/` を「語彙の縦切り」にし、レポートの描画を出す（2026-11-06）

状態: 提案（採否は未定）

**この文書は提案であって正典ではない。** 採用したら正典（`docs/architecture/browser-box.md`・`docs/architecture/directory.md`・
`docs/glossary/` の該当の子）へ人が反映し、この文書は経緯として `docs/research/` に残す。

作成: 2026-11-06。対象コミット: `tsukumo-task` の `e409fecd4`。書き方は `architecture-proposal` スキルの手順
（性質 → 候補 → 木 → 差分 → 段階）。コードは動かしていない。

**結論（3行）**

1. **性質**: ブラウザ側はサーバから流れ込む `SessionState` を描く1枚のアプリで、行数の51%（2.9万行）が会話の画面1つに
   集まっている。`features/` が痩せて見えるのは怠けではなく、2026-09-25 に `features/` を「2つ以上の枠・画面に置かれるもの」と
   定義し直した帰結で、その結果、いちばん大きな語彙の塊（レポートの描画、約105ファイル）が画面の奥の3か所に割れて埋まっている。
2. **様式**: 「`components/app` → `page` → `frame` → `features` → `ui`」の一方通行と、会話の画面を1ページにする決定はそのまま。
   **`features/` の置く基準に「`shared/` に同じ名前の機能を持つ語彙の縦切り」を足し**、レポートの描画を `features/report/` へ出す。
3. **最初の段階**: ファイルを動かさず、「機能の外から引けるのは機能の直下のファイル（公開面）だけ」を `.dependency-cruiser.cjs` に足す。

## 0. 手本（bullet-proof-react）の feature 型の思想と、tsukumo が採ったもの

bullet-proof-react の `features/` は、次の3つで1組の考え方になっている。

| 手本の考え                                                                                                  | tsukumo の今                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **機能＝業務の語彙の縦切り。** 1つの機能が自分の `components/` `hooks/` `api/` `stores/` を中に持ち、閉じる | **採らなかった。** 単位は「どこに置かれるか」（枠・画面・置かれる機能）で決め、語彙の塊は画面の中に置く                              |
| **依存は `shared → features → app` の一方向。** 機能どうしは import せず、上の段で組む                      | **採った。** `browser-box.md` の箱の向きと「機能どうしは import しない」は手本と同じで、`.dependency-cruiser.cjs` が落とす           |
| **`app/`（routes）は薄い。** 画面は機能を並べて組むだけ                                                     | **採らなかった。** 画面（`components/page/`）が語彙ごと抱える。会話の画面は 268 ファイル・2.9 万行で、ブラウザ側の最大の住人になった |

2つ目だけを採り、1つ目と3つ目を「置かれる回数で上げ下げする」規則に置き換えたので、`features/` は
**定義上、画面にも枠にも属さない余り**になる（`docs/history/decision.md`「2章『領域の機能と、置かれる機能』」の 2026-09-25 の移動）。
利用者の「`features/` があまり使われていない」という印象は、この定義から出る正しい観察。

## 1. アプリの性質

| 軸               | 読み取ったこと                                                                                                                                                                                | 根拠                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 何を中心に回るか | サーバから届く状態の流れを描く。入口は1つで、hash が出す画面を選ぶ（ルータは無い）                                                                                                            | `src/browser/main.tsx`・`components/app/layout.tsx`・`stores/location-hash.ts`              |
| 外の世界との境界 | WebSocket と HTTP の手続き（`lib/socket.ts`・`domain/rpc.ts`）、`localStorage`、DOM。境界は少なく、差し替えの予定は無い                                                                       | `src/browser/lib/`・`domain/appearance-color.ts`                                            |
| 状態の持ち方     | 共有の状態は `stores/`（16）、画面だけの状態は `page/<画面>/stores/`。永続はしない                                                                                                            | `docs/architecture/browser/state-and-rendering.md`                                          |
| 実行環境の数     | 2つ（サーバとブラウザ）。両側の語彙は `shared/<機能>/` に機能名で切られ、サーバも `server/<機能>/` で同じ名前                                                                                 | `ls src/shared src/server`（`report` `achievement` `usage` ほか）                           |
| 変わりやすい場所 | 2026-09-01 以降の変更の延べ数で、1位が `main-view`（1226）、4位が `markdown`（480）。どちらもレポートの描画を抱える                                                                           | `git log --since=2026-09-01 --name-only -- src/browser` を領域ごとに数えた                  |
| 守られている制約 | 箱の向き・枠/画面/置かれる機能の辺・ページの形・深さ6段・barrel 無し・container/presenter の対。`components/domain/` は `components/frame/` へ改名が決まっている（2026-11-06 の利用者の決定） | `.dependency-cruiser.cjs`・`test/architecture/browser-box.test.ts`・`browser-depth.test.ts` |
| 利用者と開発体制 | 個人開発で、実装はサブエージェントへ委譲する。ディレクトリ名が指示書の代わりになる                                                                                                            | `AGENTS.md`・`/next-task` の流れ                                                            |
| テストできる範囲 | 辺と形は機械で落ちる。見た目は目視と見本帳（`components/app/design/`）                                                                                                                        | `docs/architecture/testing.md`                                                              |

### 現状の大きさと依存の辺

`python3 ~/.claude/skills/architecture-proposal/scripts/import_edges.py src/browser --markdown` ほかで数えた。

| まとまり                       | ファイル |     行 |
| ------------------------------ | -------: | -----: |
| `components/page/conversation` |      268 | 28,868 |
| `components/domain/`（枠2つ）  |       55 |  6,078 |
| `features/`（3機能）           |       51 |  4,868 |
| ほかの画面3つ                  |       84 |  8,211 |

会話の画面の中（`conversation/components/` の辺）: `main-view → markdown` が **31 本**、`markdown → repository-link` が 4 本、
`main-view → inquiry` が 3 本。

### いま痛んでいる兆候

1. **1つの語彙が3か所に割れている。** レポートの描画は、`main-view/` の内容部品と A2UI の面（`*-leaf.tsx`・`a2ui-surface.tsx`・
   `report-*.tsx` ほか約34）、`markdown/`（56）、画面の `domain/` の図と Markdown の組み立て（`report-*-markdown.ts`・
   `graph-fold*.ts`・`stat-layout.ts` ほか15）に住む。どれも `shared/report/` を読み、サーバの `server/report/` と同じ語彙。
   1つの部品を直すのに、画面の3つのディレクトリを跳び回る
2. **画面の外の読み手が、画面の中を直に引いている。** 見本帳 `components/app/design/` は会話の画面の中の 20 ファイル
   （`presentational-*`・`hooks/use-*`・`a2ui-surface.tsx`）を引き、`main.tsx` は先読みのため
   `page/conversation/components/markdown/markdown.tsx` を引く。`components/app/` の例外として許されているが、
   画面の「外から見える面」が決まっていない
3. **置き場所の基準が「読み手の数」だけ。** 語彙のまとまりは基準に入らないので、レポートは画面1つにしか置かれない限り
   `features/` に上がれない。置き場所を決める問いが1つしか無く、語彙で閉じた塊を受ける箱が無い

## 2. 候補と選択

**土台は固定する**: 箱の一方通行、枠・画面・機能の辺、会話の画面を1ページにする決定（2026-09-26）、ページの形、
`page/frame/ui` の3段（2026-09-25 の利用者の決定）。候補は `features/` の定義と、何をそこへ置くかで比べる。

### 候補 A: 今の定義のまま、公開面の検査だけ足す

- 効く性質: 守られている制約。兆候2（外から中を引く）を、機能と画面の公開面を決めて止められる
- 合わない点: 兆候1と3が残る。レポートは画面の奥に3か所に割れたまま
- 要求する形: 変わらない
- 確度: 固い（検査を足すだけ）。選ばなくても C の第1段階になる

### 候補 B: 手本に忠実にする（会話の画面の領域をすべて `features/` へ）

- 効く性質: 手本どおり、画面が薄くなり、語彙ごとにディレクトリが立つ
- 合わない点: `main-view → markdown` 31 本・`main-view → inquiry` 3 本・`pending-ask-card → inquiry` が**機能どうしの辺**になり、
  手本の「機能どうしは import しない」を破るか、辺を許す表を新しく持つことになる。入力欄（`dispatch`）やキャラビューは
  会話の画面にしか置かれず、`shared/` にも同じ名前の機能が無いので、画面から切り離す語彙の境目が無い。
  2026-09-25〜26 に領域を `features/` から画面へ移した決定を、当時の理由（読み手が1つの画面だけ）が変わらないまま戻すことになる。
  移すファイルは約230
- 要求する形: `features/{main-view,dispatch,character-view,chat-view,inquiry,markdown,…}`、`page/conversation/` は組み立てだけ
- 確度: 推測（機能どうしの辺をどう扱うかが決まらない）

### 候補 C: `features/` を「語彙の縦切り」にも使い、レポートの描画を出す（選ぶ）

- 効く性質: 実行環境の数（`shared/report`・`server/report` と同じ名前の縦切りがブラウザにも立つ）と、変わりやすい場所
  （変更の延べ数1位と4位が1つの機能にまとまる）
- 合わない点: 「何を機能にするか」の問いが2つになる。問いを足す代わりに、2つ目の問いは「`shared/` に同じ名前の機能があるか」
  という、ディレクトリを見れば答えが出る形にする
- 要求する形: 下の 3.
- 確度: レポートを出すことは**固い**（3か所に割れた語彙と、画面の外の読み手が数で出ている）。基準の文面は**試す価値あり**
  （2件目の機能が出たときに文面が持つかは未検証。7. の1）

### 選んだもの: C（第1段階に A を含む）

兆候1〜3のどれにも効き、土台の決定を1つも戻さない。B は手本の形には近いが、手本自身の「機能どうしは import しない」を
守れず、会話の画面にしか置かれない領域を画面から剥がす根拠が無い。C は手本の考えのうち「機能＝語彙の縦切り」だけを
取り戻し、「画面が語彙を抱える」今の形は、`shared/` に対応する機能を持たない部品には残す。

## 3. 目標のディレクトリ構造

`components/domain/` を `components/frame/` へ改名したあとの名前で書く。

```
src/browser/
  components/
    app/            <Root>・<Layout>・見本帳。置かない: 画面や機能の中身（引くのは公開面だけ）
    page/<画面>/    画面だけの部品・状態・語彙。置かない: shared に同じ名前の機能を持つ語彙の塊
      conversation/components/
        main-view/  ターンの並び・作業帯・アウトライン・段の一覧。置かない: 内容部品と A2UI の面
        dispatch/ character-view/ chat-view/ inquiry/ …（今のまま）
    frame/<枠>/     screen-nav・sidebar（今のまま）
    ui/             語彙を持たない部品（今のまま）
  features/<機能>/  語彙で閉じた縦切り。置き場所（枠・画面）を知らずに書く。置かない: 他の機能・画面・枠への import
    report/         レポートの描画（新設）
      a2ui-surface.tsx   公開面: A2UI のレポートを描く（今の main-view/a2ui-surface.tsx）
      markdown.tsx       公開面: Markdown の遅延の入口（ADR 0027 の形のまま。今の markdown/markdown.tsx）
      repository-link.tsx 公開面: リポジトリのファイルへのリンク（今の repository-link/）
      leaf/              内容部品（*-leaf.tsx・leaf-table.tsx・checks-verdict.tsx ほか）。置かない: ターンや作業帯の部品
      renderer/          Markdown の描画（今の markdown/renderer/ をそのまま）
      domain/            図と Markdown の組み立て（今の conversation/domain/ の report-*・graph-fold*・stat-layout ほか）
      hooks/             レポートの描画だけが読むフック
    task-board/ current-work/ run-setting/（今のまま）
  hooks/ domain/ lib/ utils/ stores/ styles/ types/（今のまま）
test/browser/features/report/  src と鏡の位置（今の test の配置の規則のまま）
```

深さは `features/report/renderer/<ファイル>` で3段になり、今の `components/page/conversation/components/markdown/renderer/`（6段）より浅い。

### 許す依存の辺

| 辺                                                                  | 今   | 目標                               |
| ------------------------------------------------------------------- | ---- | ---------------------------------- |
| 画面・枠 → 機能                                                     | 可   | 可（**機能の直下のファイルだけ**） |
| `components/app/`・`main.tsx` → 機能                                | 可   | 可（**機能の直下のファイルだけ**） |
| 機能 → 機能・画面・枠                                               | 不可 | 不可（変えない）                   |
| 機能 → `components/ui`・`hooks`・`domain`・`lib`・`utils`・`stores` | 可   | 可（変えない）                     |

`.dependency-cruiser.cjs` の変更は2つ: 機能の一覧（82〜84 行目）に `features/report` を足すことと、
「`^src/browser/features/[^/]+/.+/` を機能の外から引かない」規則を足すこと（今の `<部品>.tsx` だけを外から引く規則の、機能版）。

### 名前について

`report` は `shared/report/`・`server/report/` と同じ名前（`directory.md`「機能・領域の名前は用語集の語に」）。
`leaf/` は識別子の `LeafComponent`（内容部品の識別子を揃える先）に合わせ、文書の語は「内容部品」のまま。
用語集（`docs/glossary/view.md` の機能の項）に足す文面案:

> **機能（feature）**: `src/browser/features/<機能>/` に置く、tsukumo の語彙1つで閉じた部品・状態の縦切り。置かれる場所を知らずに書く。
> `shared/` に同じ名前の機能を持つ語彙の塊か、2つ以上の枠・画面に置かれるものを機能にする。

## 4. 現状との差分

| 動くもの                                                                          | ファイル | 先                                                    |
| --------------------------------------------------------------------------------- | -------: | ----------------------------------------------------- |
| `page/conversation/components/markdown/`                                          |       56 | `features/report/markdown.tsx`・`renderer/`・`hooks/` |
| `page/conversation/components/repository-link/`                                   |        4 | `features/report/repository-link.tsx` ほか            |
| `page/conversation/domain/` の図と Markdown の組み立て                            |     約15 | `features/report/domain/`                             |
| `page/conversation/components/main-view/` の内容部品・A2UI の面・レポートの見出し |     約34 | `features/report/` 直下と `leaf/`                     |
| 読み手の import（`main-view`・`inquiry`・`components/app/design/`・`main.tsx`）   |        — | 公開面3つを引く形へ                                   |

会話の画面は 268 → 約163 ファイル、`features/` は 51 → 約156 ファイルになる。

**動かさないもの**: `main-view/` のターン・作業帯・アウトライン・段の一覧、`dispatch/`・`character-view/`・`chat-view/`・`inquiry/`・
`pending-ask-card/`・`conversation-layout/`・`prompt-image/`・`live-announcer/`、画面の `stores/`、ほかの画面3つ、枠2つ、
既存の機能3つ、`src/browser/` 直下の箱。

## 5. 移行の段階

| 段  | すること                                                                                                                                                                                                           | 終わった証拠                                                                                               | 確度 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---- |
| 1   | ファイルを動かさず、機能の公開面の規則を `.dependency-cruiser.cjs` に足す。今の3機能で違反を数え、0 にしてから入れる。正典（`browser-box.md`・`directory.md`）に基準の改訂を書く                                   | `pnpm run check` が通り、機能の中を外から引く import を足すと検査が落ちる                                  | 固い |
| 2   | `markdown/`・`repository-link/` と、それらが読む画面の `domain/`（`report-diagram-markdown.ts`・`merge-ref.ts` と、その読み先）を `features/report/` へ移す。読み手は `markdown.tsx`・`repository-link.tsx` を引く | `features/report` から `components/page` への辺が 0、`main.tsx` の先読みが公開面を引く、E2E が変わらず通る | 固い |
| 3   | 内容部品・A2UI の面と、残りの図の組み立てを `features/report/leaf/`・`domain/` へ移す。見本帳は `a2ui-surface.tsx` を引く                                                                                          | `main-view → features/report` の辺が公開面だけ、見本帳 `#design` の内容部品が今と同じに見える（目視）      | 固い |
| 4   | 2件目の候補（7. の2）を同じ基準で判定し、当たれば同じ手順で出す                                                                                                                                                    | 判定の結果を `docs/history/decision.md` に1節                                                              | 推測 |

段2と段3は、パスと識別子を同じファイルで書き換えるタスクと衝突するので、**`frame` への改名・内容部品の識別子の統一・会話画面の `| undefined` の削減が済んでから**着手する。段1は先に入れてよい。

## 6. 採らなかった案

- **候補 B（手本に忠実）**: 2. のとおり。機能どうしの辺を許す表を持つ案も、手本の一方向の考えを崩すので採らない
- **レポートと Markdown を別の機能にする**: `main-view` の内容部品が `markdown.tsx` を 26 本引いており、分けると機能どうしの辺が要る
- **入力欄を `features/composer/` にする**: `shared/` に同じ名前の機能が無く、置かれるのも会話の画面1つで、基準のどちらにも当たらない
- **会話の画面を複数の画面に割る**: 2026-09-26 の「会話の画面は1ページ」の決定があり、当時と性質（4領域が同時に見える1画面）が変わっていない
- **手本の `app/routes/` を作る**: ルータが無く、出す画面は hash を読む `<Layout>` 1つで決まる。`docs/history/decision.md`「採らなかった bullet-proof-react の要素」と同じ理由

## 7. 未決事項

1. **基準の文面の持ちこたえ**: 「`shared/` に同じ名前の機能がある」を問いにしたが、2件目の機能でこの問いが余計なものまで拾わないかは未検証。
   別の読み方（「画面の外に読み手がある語彙の塊」）を採ると、見本帳が引く `dispatch`・`character-view` も機能に上がり、B に近づく
2. **2件目の候補**: 作業帯と段の一覧（`main-view` の `work-strip`・`phase-list`）は `shared/work-plan/`・`server/work-plan/` と語彙が重なる。
   基準を当てると `features/work-plan/` の候補になるが、ターンの並びと絡む度合いを数えていない
3. **見本帳が画面の中を引く件**: 見本帳は会話の画面の中を 20 本引いている（レポート以外にも `dispatch` や `character-view` の presenter）。
   この提案は機能の公開面だけを決め、画面の公開面は決めない。画面にも同じ規則を掛けるかは別に決める
4. **公開面の決め方**: 「機能の直下のファイル」を公開面にした。明示の一覧で持つ案もあるが、ファイルを足すたびに一覧を直すことになるので採っていない
