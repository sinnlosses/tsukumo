# `report` の `a2ui` の版を、部品が閉じるたびに草稿として描く（2026-10-28）

ステータス: 採用

**`a2ui` の版の `report` は、引数の断片（`input_json_delta`）から部品を 1 つずつ切り出し、部品 1 つにつき 1 イベント（`report-draft-component`）として流して、確定版が届く前に草稿を描く。草稿は暫定の表示で記録ではない。確定版の `report` が届いた 1 手で草稿を確定版に置き換え、差し戻し・ターンの終わりでは草稿を消す。** 段階描画を採ることは利用者が決めた（2026-10-28）ので、この ADR は採るかを比べない。決めるのは、差し戻しの取り消し・構造の規約・目次と演出と復元・イベントの形・切り出しの状態の置き場の 5 つ。

対象は `a2ui` の版だけ。旧い版（`sections`・`body` ほか）の呼び出しは変えない。

## 何が困っていたか

- 計測（`docs/research/a2ui-streaming-2026-10-28.md`）で、引数の断片は入り、部品を 1 つずつ閉じた時点で切り出せ、21 部品が全文の読みと一致した。長い報告では最初の部品が約 15 秒早く描ける。
- いまの駆動は `content_block_start` の合図だけを `report-drafting` にして断片を捨てている（`src/server/session-driver/core/sdk-stream-message.ts` の `reportDraftingEvents`）。
- 記録の「採らない理由になりうる点」にある 3 つが決まっていない。先に描いた部品が呼び出し全体の判定で差し戻されること、構造の規約は部品が揃うまで判定できないこと、目次・演出・復元が完成した報告を前提にしていること。
- ADR 0039 は論点 4 (d) で段階描画を別の測定に預けた。測定が済んだので、描き方を決める。

## 決めたこと

### 論点 1: 差し戻しの取り消し

**草稿は暫定の表示。同じ `toolUseId` の `report` が届けば確定版に置き換え、`tool-finished` が `isError` で届けば草稿を消す。**

- `ReportReview.pass` は `report` を同じ `toolUseId` の `tool-finished` まで預かる。通すときは `[report, tool-finished, ...]` の順、差し戻すときは `report` を捨てて `[tool-finished, report-rejected]` を出す（`src/server/report/core/report-review.ts` の `pass`）。
- 草稿を下ろす手は既にある。`report` の畳み込みと `tool-finished` の畳み込みがどちらも `settleReportDrafting` を呼ぶ（`src/shared/session/session-advance.ts`）。通した場合は `report` が届いた 1 手で草稿が確定版に入れ替わり、差し戻した場合は `tool-finished` の 1 手で消える。
- 草稿を畳む見え方は「消す」。薄く残さない。
- 出し直しは別の `toolUseId` で、新しい `report-drafting` から空の草稿で始める。
- ターンが閉じたとき（中断など）も草稿は消す。`sdkTurn` が `CLOSED_SDK_TURN` になって草稿ごと消える。`partialUtterance` のように記録へは移さない。
- 理由: 差し戻した呼び出しは記録にも `report` のイベントにも残らない。草稿だけ残すと画面が記録と食い違う。
- 復元は変わらない。差し戻された `report` は transcript に `tool_use` として残り、復元はそれを `createCallReview().pass` に通して今も捨てている（`src/server/session-driver/core/session-restore.ts`）。

### 論点 2: 構造の規約

**草稿は、届いた部品のうち根（`root`）から辿れるものだけを描く。辿れない子は届くまで描かない。規約の判定は、いまどおり全部が届いたあとの `report` ツールの handler（`judgeReportStructure`）だけが行う。**

- 駆動は、切り出した部品を `a2uiReportComponentSchema.safeParse` に通し、形の合う部品だけをイベントにする。合わない部品は黙って捨てる（その子は辿れないので描かれない）。
- 同じ ID が 2 度届いたら最初のものを採る（`a2uiPartsById` と同じ規則）。
- 既に `a2uiOutlineSections` は「辿れない参照は飛ばし」、`a2uiReportInput` は規約に外れた一覧も落とさず写す。草稿の寛容さは前例と同じ。
- 親が先に描かれ、子が届くたびに埋まる動きは試作で確かめ済み（`docs/research/a2ui-report-prototype-2026-10-28/index.md`）。
- 規約違反の一覧でも草稿は出る。差し戻されれば論点 1 で消える。

### 論点 3: 目次・演出・復元

**草稿は目次と演出の対象外で、transcript にも残さない。復元は完成した `report` だけから行う。**

- 目次: 目次は記録の `report` から作る見え方に依存する。草稿は記録でなく `sdkTurn` の持ち物なので、確定版が着くまで目次に載らない。
- 演出: 筆は「このやり取りを出し始めたあとに現れた最終レポートのステップ」に、マウント時の DOM を見て掛かる（`turn.tsx` の `revealStepId`、`use-report-reveal.ts`）。草稿が現れていたレポートの確定版に筆を走らせると、読み終えたものがもう一度書かれる。同じ `toolUseId` の草稿があった確定版は `reveal` を偽にする。草稿には演出を掛けない。部品が閉じるたびに足されること自体が段階的な出方になる。
- 復元: transcript は assistant の完成メッセージだけで `stream_event` を含まない。tsukumo は会話を保存しない（`docs/requirements/session-restore.md`）ので、草稿について新しく書くものは無い。

### 論点 4: イベントの形

**部品 1 つにつき 1 イベント。形は `{ kind: "report-draft-component", toolUseId, component }`。順序の番号は持たせない。**

- `component` は駆動が `safeParse` を済ませた `A2uiReportComponent`。畳み込みとブラウザは検証済みの型を受け取る。
- 畳み込みが部品の ID で重複を弾く（最初のものを採る）ので、再送・順序の入れ替わりに強い。
- 草稿の状態は畳み込み側（`SessionState.sdkTurn` の `reportDrafting`）が持つ。`ReportDrafting` の `drafting` に `components: readonly A2uiReportComponent[]` を足す。`report-drafting` と `toolUseId` と寿命が揃っているので、同じ場所に置く。
- `report-draft-component` は、同じ `toolUseId` の `drafting` が開いているときだけ積む。開いていなければ捨てる。
- `session-event-kind.ts` に種類を足し、`MODEL_OUTPUT_EVENT_KINDS`（`session-advance.ts`）にも足す。
- 既存の読み手（`use-current-work.ts`・`use-current-step.ts`・`use-work-strip.ts`・`use-character-view.ts`）は `.kind` だけを見るので壊れない。
- 駆動から出たイベントは `CallReview.pass` を通る。`ReportReview.pass` の `default` が素通しにし、`ledger.observe` も無視するので、差し戻しの帳面は動かない。
- `pnpm run test:e2e:update` が要る（セッションイベントの種類が増える）。

### 論点 5: 切り出しの状態の置き場

**塊ごとの切り出しの状態は、駆動のセッション 1 つにつき 1 つの intake（`ReportDraftIntake`）が持つ。**

- `relayMessages` が既に `titleIntake`・`ledgerIntake` を持つ（`src/server/session-driver/adapter/sdk-driver.ts`）。同じ置き方で、`observe(message)` が `SessionEvent` の並びを返す。
- `toSessionEvents` と `reportDraftingEvents` は状態を持たない関数のまま残す。`stream_event` の分岐は復元（`session-restore.ts`）も通る共有の変換なので、状態を足さない。
- intake は、メインの `report` の `content_block_start` で `index → { toolUseId, 切り出しの状態 }` を登録し、同じ `index` の `input_json_delta` の `partial_json` を読み手に渡す。閉じた部品を `safeParse` して `report-draft-component` にする。`content_block_stop` と `message_start` で登録を捨てる。`parent_tool_use_id` があるもの（サブエージェント）は見ない。
- 読み手は `scripts/runtime/a2ui-component-splitter.ts` にあり、`src/` から読めない。作り直さず、同じ読み手を `src/server/session-driver/core/` に移す。
- 旧い版の `report` は `components` のキーを持たないので、読み手は何も出さない。「対象は `a2ui` の版だけ」は引数の形で自然に成り立つ。
- 会話の内容: 断片と切り出した JSON 文字列は intake のメモリだけに置き、ログにもファイルにも書かない。出てくるのは検証済みの部品だけで、いまの `report` イベントと同じ取り扱い（`docs/coding-standards/conversation-content.md`）。

## 採らなかった案

| 案                                         | 採らなかった理由                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 差し戻された草稿を薄く残す                 | 差し戻した呼び出しは記録に残らない。出し直しの草稿と同じ内容が 2 つ並び、画面が記録と食い違う        |
| 差し戻しの判定を待ってから描く             | 段階描画をやめることになる。利用者が段階描画を採ると決めたので比べない                               |
| 累積した部品の一覧を毎回運ぶイベント       | 部品 21 個で転送が部品数の 2 乗に増える。1 部品 1 イベントで足りる                                   |
| 順序の番号を持たせる                       | ID で重複を弾けば足りる。番号を持たせると、欠けた番号の扱いを畳み込みが決めることになる              |
| 草稿を記録（`SessionRecord`）に積む        | 差し戻し・中断で取り消すときに、積んだ記録を消す手が要る。目次と演出も草稿を除く条件を持つことになる |
| 構造の規約を草稿の段階で判定して描き分ける | 規約は部品が揃わないと判定できない。判定は handler の 1 か所に残し、草稿は辿れるものを描くだけにする |
| 草稿にも筆の演出を掛ける                   | 部品が閉じるたびに足されること自体が段階的な出方で、確定版の筆は読み終えたものを書き直す             |

## 未決

1. 確定版との見た目のずれを許容できるか。草稿の葉は図表番号・傍注の番号なしの Markdown になる（番号は部品の並び全体から取るので途中では付けられない。`src/shared/session/a2ui-report-view.ts`）。確定版への入れ替わりで番号が現れ、頭の欄（時間・合図の行）が足され、最終レポートは final-first の並びに入れ替わることがある（これは今の確定版の着地と同じ動き）。ブラウザの実装が目視で確かめ、許容できるかを決める。
2. 許容できないときの番号つきの草稿。部品の一覧から旧い版の引数の形を組む `a2uiReportInput`（`src/server/session-driver/core/a2ui-report-message.ts`）を `src/shared/` へ移し、ブラウザが草稿の部品から番号つきの見え方を作る。移すと共有層に変換が増えるので、必要と分かってから別の課題にする。
3. 草稿の部品の増え方が演出の代わりとして足りるか。短い報告では差が小さい（記録の「効果」）。使われ方を見て、段階描画を長い報告だけに絞るかを利用者が決める。

## 影響

- `SessionEvent` に `report-draft-component` が増え、`ReportDrafting` の `drafting` が `components` を持つ。`pnpm run test:e2e:update` が要る。
- 駆動に `ReportDraftIntake` が増え、読み手が `scripts/runtime/` から `src/server/session-driver/core/` へ移る。
- ブラウザは草稿を `sdkTurn` から読み、`a2ui` の面へ部品が届くたびに流す。確定版は同じ `toolUseId` の草稿があったとき `reveal` を偽にする。
- 後段の課題（駆動とイベントの実装・ブラウザの草稿描画の実装）の本文は、この ADR の「決めたこと」に揃える。
- 0031（欄ごとの描画と演出・目次の区切り）・0039（`report` を A2UI で受けて描く）は覆さない。0039 の論点 4 (d)「段階描画は別の測定に預ける」を、この ADR が引き取る。
