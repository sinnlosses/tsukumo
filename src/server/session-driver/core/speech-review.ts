// `speak` の差し戻し。
// 直前に描いたセリフのあとに新しい事実が届いていない `speak` を、画面に出さずに差し戻す（新しい事実が届くまで毎回）。
// 「新しい事実」は文面ではなく、届いたもので決める:
// 利用者の依頼（`request` / `turn-started`）、ターンの頭（`session-info`）、メインが呼んだ `speak` / `report` / `work_plan` 以外のツールの結果、背景のタスクの終わり（顔ぶれから消えた）。
//
// 判定の窓口は `speak` の handler だけ（`SpeechReview.judge`）。
// `SpeechReview.pass` が `speak-called` を同じ呼び出しの `tool-finished` まで預かり、`isError`（差し戻したら true）に従って描くか捨てるかを決める。
// SDK は handler の呼び出しと `assistant` メッセージの届く順を決めないので、結果（`tool_result`）が必ず handler より後に届くことだけを当てにしている。
//
// handler はサブエージェントの呼び出しとメインの呼び出しを見分けられないので、サブエージェントの `speak` も判定に掛かる。
// サブエージェントの `speak` は `speak-called` にならない（変換が `speech` のまま出す）ので、ここでは預からない。

import type { SessionEvent } from "../../../shared/session/session-event.ts"

/** handler の判定。`rejected` の `text` はそのまま `speak` の戻り値になる。 */
export type SpeechVerdict =
  | { readonly kind: "accepted" }
  | { readonly kind: "rejected"; readonly text: string }

export type SpeechReview = {
  /** `speak` の handler から。直前に描いたセリフのあとに新しい事実が届いていなければ差し戻す。 */
  readonly judge: () => SpeechVerdict
  /**
   * 届いたイベントを流してよい並びに変える（メインのイベントだけを渡す）。
   * `speak-called` は同じ `toolUseId` の `tool-finished` まで預かり、`isError` でなければその直前に `speech` として出す。
   * 預かったままターンが終わった呼び出し（結果の届かなかった呼び出し）は、`turn-finished` の直前に出す。
   */
  readonly pass: (event: SessionEvent) => readonly SessionEvent[]
}

/** 新しい事実の帳面（`CallReview` が1つだけ持つ）のうち、`speak` が読む口。 */
export type SpeechNews = {
  readonly hasNews: () => boolean
  readonly markDrawn: () => void
}

type SpeakCalled = Extract<SessionEvent, { readonly kind: "speak-called" }>

/** {@link SpeechReview} を1つ作る。セッション1つに1つ。 */
export function createSpeechReview(news: SpeechNews): SpeechReview {
  let held: readonly SpeakCalled[] = []

  return {
    judge: () =>
      news.hasNews()
        ? { kind: "accepted" }
        : { kind: "rejected", text: SPEECH_NOTHING_NEW_REJECTION_TEXT },
    pass: (event) => {
      switch (event.kind) {
        case "speak-called":
          held = [...held, event]
          return []
        case "tool-finished": {
          const call = held.find((candidate) => candidate.toolUseId === event.toolUseId)
          if (call === undefined) {
            return [event]
          }
          held = held.filter((candidate) => candidate !== call)
          if (event.isError) {
            return [event]
          }
          news.markDrawn()
          return [call.speech, event]
        }
        case "turn-finished": {
          const unsettled = held.map((call) => call.speech)
          held = []
          return [...unsettled, event]
        }
        default:
          return [event]
      }
    },
  }
}

/** 新しい事実の無い `speak` を差し戻すときの戻り値。固定の文面だけで、モデルが書いたセリフも画面の状態も写さない。 */
export const SPEECH_NOTHING_NEW_REJECTION_TEXT =
  "直前のセリフのあと、新しい依頼もツールの結果も背景のタスクの終わりも届いていないので、" +
  "このセリフは画面に出していない。委譲の合図を待つあいだは `speak` も `report` も呼ばず、" +
  "何も書かずにターンを終えること。言い回しを変えて呼び直さないこと。" +
  "この差し戻しは利用者には見えないので、セリフでもレポートでも触れない。"
