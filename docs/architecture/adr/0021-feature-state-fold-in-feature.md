# 機能だけが動かす状態の畳み方は、その機能の shared に置く（2026-09-30）

**`SessionState` の欄のうち、1つの機能のイベントだけで動き、値の置き換えより多い判断を持つ欄の組は、
その機能の `shared/<機能>/` に部分の reducer として置く。** `applySessionEvent` は入口のまま残り、
その機能のイベントを部分の reducer へ1行で委ねる。日記（`diaryWriting`。`src/shared/diary/diary.ts` の
`DiaryEvent` / `applyDiaryEvent`）と見直し（`usageReview` と `previousUsageReview`）をこの形へ移す。

## 何が困っていたか

`applySessionEvent` は 49 種類のイベントを1つの `switch` で畳み、`session-state.ts` は約 1,000 行、
そのテストは約 1,500 行ある。日記の段が戻らない規則（`withDiaryStage`）や、見送った提案を2つの欄から
取り除く規則（`withoutDismissedProposal`）は、その機能の型（`DIARY_STAGES`・`usageProposalKey`）が
`shared/diary/`・`shared/usage-review/` にあるのに、畳み方だけが `session-state.ts` の末尾に並んでいた。
1つの機能の状態の変わり方を読むのに、型の置き場と畳み方の置き場を行き来することになる。

## 決めたこと

- **分ける単位**: 次の2つを満たす欄の組
  1. 動かすイベントがその機能のものだけ（またがるイベントへの反応は下の名前の付いた関数で出す）
  2. 値を写すだけでなく、判断（状態の移り方・古い知らせを捨てる条件など）を持つ
- **分けないもの**:
  - 値を写すだけのイベント（`chat-topics-changed`・`plan`・`tasks-changed` など）は入口の1行のまま。
    部分の reducer にすると、消しても複雑さが戻らない素通しになる
  - 記録・ターン・セリフ・API の不調の芯（`records` `turn` `speeches` `partialUtterance`
    `reportDrafting` `apiTrouble` など）は `session-state.ts` に残す。ほとんどのイベントが記録とターンの
    欄を同時に動かすので、割るとまたがるイベントのほうが多くなる
- **`SessionState` の形は変えない。** 欄は平らなままで、部分の reducer は自分の欄（見直しなら2つの欄の組）
  だけを受け取って返し、入口が `SessionState` へ広げ直す。状態の形を変えると `PROTOCOL_VERSION` が
  上がり、ブラウザの読み手すべてに波及する（「版と互換」）
- **部分の reducer は `SessionState` を受け取らない。** 別の部分の状態が要るとき（見直しの始まった時刻に
  いま走っているターンの始まりを使う、など）は、入口が値にして引数で渡す。shared の機能は `session/` を
  読まない（「shared の機能」の辺の規則）ので、`TurnProgress` のような型も渡さない
- **イベントの型はその機能に置く。** `DiaryEvent` と同じく、その機能のイベントの和（`kind` ごとの
  doc コメントごと）を `shared/<機能>/` に置き、`session-event.ts` の `SessionEvent` がそれを和に含める。
  形は変わらないのでプロトコルの変更ではない
- **またがるイベントは入口の1つの `case` で畳む。** `turn-finished`・`session-ended`・
  `conversation-cleared`・`history-restored` は、`applySessionEvent` のその `case` を読めば全部の部分への
  効き方が分かるように、入口が各部分の名前の付いた関数（見直しなら「ターンの終わりで、結果を渡さずに
  終わった見直しをふだんへ戻す」関数）を呼ぶ。部分の reducer に `SessionEvent` 全体を渡して各自で
  反応させる形にはしない
- **テストの置き場**: 部分の reducer の振る舞いは、その reducer を直に呼ぶテストとして
  `test/shared/<機能>/` に置く。`test/shared/session/session-state.test.ts` に残すのは、芯の振る舞いと、
  機能ごとに「そのイベントは自分の欄だけを動かす」ことを1件ずつと、それにまたがるイベントの効き方だけ

**機能を足すときの当て方**: 新しい欄が上の2つを満たすなら `shared/<機能>/` に部分の reducer を置き、
満たさなければ入口に `case` を1行足す。

## 同じ設計で分けないと決めたもの

- **`src/server/session-driver/core/sdk-message.ts`**: インターフェースは「SDK のメッセージ1件を
  イベントの並びへ」の `toSessionEvents` 1つで状態を持たず、中はすでにメッセージの種類ごとの小さな関数に
  割れている。変わる軸は機能ではなく SDK のメッセージの種類なので、機能で割ると同じ検証の語彙を
  共有する浅いモジュールが並ぶだけになる
- **`src/server/session/core/session-manager.ts`**: イベントへの機能ごとの反応（トークン消費・
  コンテキストの内訳・会話のアーカイブ・`report` の塊の記録）はすでに各機能の `core` の
  係へ委ねていて、残っているのは代の寿命と、反応を起こす順だけで1つの概念になっている。テストが
  約 3,400 行あるのは、ほかの機能のコマンドの受け手を `createCommandRouter` 越しに確かめるテストが
  同じファイルに集まっているためで、`session-manager.ts` を割っても減らない

## 採らなかった案

- **`SessionState` を機能ごとの入れ子にする**（`state.diary.writing` など）: 分け方は素直になるが、
  状態の形が変わって版が上がり、ブラウザ側の読み手とテストのほぼすべてを書き換えることになる
- **部分ごとの reducer に全イベントを配って組み合わせる**（各部分が自分に関係するイベントを拾う）:
  `turn-finished` が何を動かすかが部分の数だけのファイルに散り、各機能が `SessionEvent`（`session/`）を
  読むので shared の機能どうしの辺が輪になる
- **値を写すだけのイベントも機能ごとに分ける**: 分けたファイルが `{ ...state, x: event.x }` だけになり、
  入口の `case` が委ねる1行に変わるだけで読む量が減らない
