# アーキテクチャ詳細: shared（両側が共有する契約）

ステータス: **正典**。入口は `docs/architecture.md`（全体構造の入口と、子のファイルの一覧）。

責務: サーバとブラウザが共有する契約（イベント・状態・コマンド・フレーム・版）について、コードから読み取れない決定を持つ。
読む時: `SessionEvent`・`SessionState`・コマンドの契約・`ServerFrame`・版を足す・変えるとき。
直す時: イベントの運び方・状態の畳み方・記録の時刻・フレームと版の規則を変えたとき。

## 節の索引

| 節                | 中身                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| ## shared         | zod を使うのは境界の書き込み側と封筒だけ                                                                                  |
| ### SessionEvent  | イベントは時刻を持って送る、`state.model` の先回り、`request` の画像の控え、`character-changed`、API の不調の運び方       |
| ### SessionState  | `connection` を入れない、畳み込みの規則、成果は `SessionState` に入れない、API の不調の持ち方、記録の時刻、部分の reducer |
| ### ClientCommand | コマンドの一覧と入力の正典、`text` と `images` の上限                                                                     |
| ### ServerFrame   | 版が合わないときの画面                                                                                                    |
| ### 版と互換      | `PROTOCOL_VERSION` を上げるとき                                                                                           |

## shared

**zod を使うのは境界の書き込み側と封筒だけ。**
コマンドの契約の入力（`src/shared/contract/<機能>.ts`）は**全部 zod が正典**（ブラウザから届く書き込みの
経路なので厳密に見る。`text` の上限もここ）。`ServerFrame` は**封筒（`type` / `protocolVersion`）だけ** zod で、中身
（`state` / `events`）は検証しない。**`SessionEvent` と `SessionState` は zod にしない**（TS の型のまま。
状態にフィールドを1つ足すたびにスキーマを二重に直す手間のほうが効いてくるため）。
ツールの引数の検査（`work_plan` の `workPlanSchema`）も境界の入力なので zod が正典で、ツールの形はそこから作る。
境界（WebSocket の両端）で1回だけ検証し、中では検証済みの型を使う。`shared` の中に `node:` も
`document` も持ち込まない（「層と依存の向き」）。

### SessionEvent

`SessionEvent` の一覧とフィールド、各イベントの出どころは `src/shared/session/session-event.ts` と、
概念ごとに分けた `session-event-*.ts` の型定義（`kind` ごとの doc コメント）を正典とする。ここに残すのは、コードから読み取れない決定だけ。

**イベントは時刻を持って送る**（`StampedEvent`）。`at` はサーバの時計で、reducer は
`applySessionEvent(state, event, at)`。**ブラウザ側で時計を reducer に渡さない**（両側の状態が同じに
なるように、時刻はイベントの発生側が決める）。

**`state.model` は `init` を待たずに先回りで更新する**（`/model` を送ったそのターンの `init` はまだ古い
モデルを返す）。`assistant` に乗る `local_command_run` の `args` が `MODEL_ALIASES`（「ClientCommand」）と完全一致する
ときだけ更新する。**`local_command_run` を持たない古い SDK ではこの経路が黙って効かなくなり**、テストは
通ってしまうので、SDK の下限を下げるときは確かめ直す（版の実測は `docs/history/decision.md`
「design.md 2〜11章（約1000行へ締めたときに落とした経緯と実測）」）。`session.setModel` も同じ
`model-changed` を使い、駆動が確定を待ってから出す（駆動を経るのでローカル echo の禁止には当たらない）。

**`request` は文面だけでなく、添えた画像の控え（`images: string[]`）も運ぶ**（`docs/requirements.md`
4.10）。**原寸は載らない** — 原寸はモデルへ渡ったあとサーバのメモリの棚（`prompt-image-shelf.ts`）に
直近ぶんだけ残る。控えを作るのはブラウザ側で、**サーバは画像を加工しない**。

**`character-changed` は、いま出しているパックの姿と一緒に全パックぶんの一覧（`packs`）を運ぶ。**
**一覧だけの別のイベントにはしない**（契機が重なり、分けると片方を出し忘れたときに一覧と姿がずれる）。
ターンの中では流れない。1件の形・配り直す契機・素材の URL は `docs/architecture/character-pack.md`「パックの一覧と素材の URL」。

**API の不調は3つのイベントと `turn-finished` の `outcome` で運ぶ**（`api-retry` / `api-error` /
`rate-limit-changed`、`outcome: completed | interrupted | failed(cause)`。型は `src/shared/session-driver/turn-failure.ts`）。

- **`api-error` だけではターンの失敗にしない**——Claude Code が立て直して続けることがあるので、失敗かどうかは
  `result` を写した `outcome` が決める
- `result` は API のエラーの種類を持たないので、**種類を足すのは畳み込み**（そのターンの `api-error`、
  無ければ最後の `api-retry`、どちらも無ければ `unknown`）。変換（`sdk-message.ts`）は状態を持たない
  1メッセージ1変換のまま保つ
- **中断は失敗にしない**（`error_during_execution` は、`terminal_reason` が中断なら `interrupted`。
  `terminal_reason` が無いときは、tsukumo がそのターンに中断を送っていたときだけ `interrupted`、送っていなければ失敗。
  transcript から組み直すときは送った事実が分からないので、理由の無いものは失敗になる）
- **運ぶのは型の決まった値だけ**で、`result` の `errors` の自由文は契約に入れない（`docs/requirements.md` 4.1）

### SessionState

`SessionState`（`src/shared/session/session-state.ts`）の各フィールドと理由は、その型（および
`TurnProgress` / `CharacterInfo` など内訳の型）の doc コメントを正典とする。ここに残すのは、
`SessionState` の外側にある決定だけ。

**`connection`（接続中／切断中）は `SessionState` に入れない**（サーバ側に意味が無いため）。
ブラウザだけが持つ状態で、`src/browser/stores/session.ts` の `SessionStoreState` が `SessionState` と
同じ store に相乗りさせて配る。

**畳み込みの規則は `shared` の側が持つ**（`speeches.slice(-1)`・`speechCalledInTurn`・
`MAX_SESSION_STATE_TURNS` の窓）。**記録（`SessionRecord`）を依頼の区切りでターンに割るのは
`src/shared/session/turn.ts` の `splitIntoTurns` だけ**で、メインビュー・ターンごとのセリフ・依頼の手順・記録の
窓はその並びの上で自分の形に変え、依頼より前の記録（`PRE_REQUEST_TURN_ID`）をどう扱うかも各所が決める。

**成果は `SessionState` に入れない。** 成果の画面の中身は、画面が開いているときにブラウザが読み取りの
手続き（`achievement.day` / `achievement.calendar`）で取りに行く（状態に入れるとどの画面でもフレームと
再接続のたびに運び、数えるのに `bd` を何度も起こす）。応答の決まり:

- **応答はサーバの今日（`today`）を持つ。** 日の境目を決めるのはサーバの `local-time.ts` の1箇所で、
  ブラウザは時計を読まず、「次の日」を押せるかと「今日へ」を出すかを `today` との比較で決める
- **読めないものは応答の値で伝える**（画面に何を出すかは `docs/requirements.md` 4.11「数えられない・読めないとき」）。
  数えられない場面は `{ kind: "unknown" }`（200）、
  **数える途中の `bd` の失敗は 503** で、部分的な数を配らない。日記が読めないのは `unreadable` として数と一緒に配る
- 入るのは数・タスクの ID と `summary`・日付と日記だけで、会話の文面は
  入らない。起動トークンが要る（「会話内容と安全」）

**経過時間**は `turn` が持つ時刻から browser が計算する（`SessionState` に秒数は入れない）。

**API の不調の持ち方**。3つに分けて持つ。消える理由がそれぞれ違うため:

- **`apiTrouble`**（`src/shared/session-driver/api-trouble.ts`）は**いまのターンの中だけ**の状態。ターンの境目と、
  **モデルが何かを出したとき**（`MODEL_OUTPUT_EVENT_KINDS`）に下ろす。呼び直しが実った合図は SDK から
  来ないので、応答が届いたことを合図の代わりにする
- **`rateLimit`**（`src/shared/session-driver/rate-limit.ts`）は**セッションを通した**状態で、次の
  `rate-limit-changed` が来るまで持つ（戻る時刻を過ぎても、戻ったかは次の知らせでしか分からない）
- **失敗の理由**は `turn` の `finished` の `ending`（次の依頼まで）と、記録の `turn-failure`（記録の窓から
  落ちるまで）の2か所に残す

**記録の時刻**。記録のうち**依頼（`request`）とセリフ（`speech`）の2種類だけ**が `time: RecordTime` を
持つ。読むのは雑談のログ（`docs/architecture/screen-design.md` 13.7「時刻と日の区切り」）と、キャラビューのセリフのログの依頼の区切りで、
仕事のメインビューへ渡す形（`MainViewEntry`）には載せない。

- **形は判別可能な合併型**（`RecordTime`）: `stamped` は起きた時刻が分かり、`recovered` は前のセッションを
  組み直したが transcript の `timestamp` から時刻を戻せたもの、`restored` は時刻が分からないもの
  （`at: number | undefined` にしない）。時刻を読む側は `recordTimeAt` で `stamped` と `recovered` を同じに読む
- **時刻を打つのはサーバ**（イベントの `at` をそのまま写す）。畳み込みの中で時計は読まない（「SessionEvent」）
- **ほかの種類には足さない**（雑談のログが拾わないうえ、記録を作る場所すべてに時刻の出どころが要る）
- **復元した記録の時刻は transcript の `timestamp` から戻す**（`getSessionMessages` が型に無い
  `timestamp` を各メッセージに載せて返す。アーカイブと文面で突き合わせない）。読めないメッセージの
  出来事は「分からない」に倒し、推し量らない
- **組み直した出来事は `RestoredEvent`（出来事と、読めた時刻か「読めない」）で運び**、`applyRestoredEvents` が
  順に畳む。読めた出来事で積んだ記録の `stamped` は `recovered`、読めなかった出来事のものは `restored` に
  写し替える。読めない出来事は直前に読めた時刻（まだ無ければ今）で畳む。流し直した時刻を記録に残すと、
  起こし直した直後のログが全部「いま」に見える

**`session-advance.ts` は純粋な畳み込み。** 姿から導くだけのもの（メインビューに出す形・`/`
補完の候補）は `main-view.ts` / `command-suggestion.ts` に分けてある。状態を持つのはサーバ側の `session-manager` と
ブラウザ側（`browser/stores/session.ts` の zustand の store）だけで、「イベント1件でどう変わるか」はすべてここのテストで守れる。

**1つの機能だけが動かす欄の畳み方は、その機能の `shared/<機能>/` に置く**（日記の `applyDiaryEvent` の形）。
当てるのは、その機能のイベントだけで動き、値の置き換えより多い判断を持つ欄の組だけで、値を写すだけの
イベントと、記録・ターン・セリフ・API の不調の芯は `session-advance.ts` に残す。記録から導く今のワークプランの
畳み方（`nextWorkPlan`・`currentWorkPlan`）は `shared/session/work-plan-fold.ts` に1つだけ置き、`session-advance.ts` と
サーバの差し戻し（`WorkPlanReview`）はその結果を読む。

- **`SessionState` の形は平らなまま変えない。** 部分の reducer は自分の欄だけを受けて返し、`SessionState` を
  受け取らない（別の部分の状態が要るときは入口が値にして渡す）
- **またがるイベント**（`turn-finished`・`session-ended`・`conversation-cleared`）は
  `advanceSessionState` の1つの `case` で畳み、各部分は名前の付いた関数で反応を出す（入口の `applySessionEvent` は
  それを呼んでから、吹き出しが出し始めた反応を記録に積む）
- **テスト**は部分の reducer を直に呼ぶものを `test/shared/<機能>/` に置き、`session-advance-*.test.ts` には芯と、
  委ねていること・またがるイベントの効き方だけを残す

理由・分けないと決めたもの（`sdk-message.ts`）・採らなかった案は
`docs/architecture/adr/0021-feature-state-fold-in-feature.md`。

### ClientCommand

**節の名前は移す前のまま**（コマンドの和 `ClientCommand` は手続きへ移して消えた）。コマンドの一覧と
入力は機能ごとの契約 `src/shared/contract/<機能>.ts`（zod。「shared」の冒頭の決定どおりここが正典）、束は
`src/shared/rpc.ts` の `commandContract` を見る。どの機能が受けるか・断る条件は
「コマンドの受け手と手続きの置き方」。

- `text` の上限は `MAX_PROMPT_TEXT_LENGTH`（`src/shared/contract/session.ts`）
- `images` は**原寸と控えの対**（`PromptImage`。`src/shared/session-driver/prompt-image.ts` が正典）。値そのものは
  `docs/requirements.md` 4.10 が正典。**1枚も無いのが普通**なので、field ごと省いた形も受け取って空に
  畳む。WebSocket の `maxPayload` は原寸が上限まで全部通る大きさにしてある
- `PermissionMode` と `ModelAlias` の値の一覧は **`shared`（`src/shared/command.ts`）に1つだけ
  置く**。SDK の型との一致は `core` 側のテストで守る

### ServerFrame

`ServerFrame` の一覧とフィールドは `src/shared/frame.ts` の型定義（`type` ごとの doc コメント）を
正典とする。

- `protocolVersion` が browser の `PROTOCOL_VERSION` と違えば、browser は会話の画面の代わりに
  「ページを読み込み直してください」を出し、以降の `events` を畳まない（起こし直したプロセスと古いタブの
  組み合わせで起きる。画面だけ差し替わった道は`docs/architecture/build.md`の指紋で塞いだが、塞ぎ損ねたときは上げ直すまで
  直らないので、知らせにはそれも書く）。版の合う `hello` がまた届けば戻る

### 版と互換

`PROTOCOL_VERSION` は整数1つ。**イベントの追加は版を上げない**（知らない `kind` は reducer が
無視する）。既存イベントの形を変える・状態の形を変えるときだけ上げる。
