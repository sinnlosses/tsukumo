// 届いたイベントをまとめて配るための束（docs/design.md 5章）。**1件ずつ押さない**のは、
// 書きかけの本文がトークン単位で届くので、1件ずつ配ると転送量が跳ねるため。
//
// **駆動1代ぶんの持ち物**として `src/server/session/core/session-manager.ts` が持ち、起こし直すと
// 作り直す（前の代の積み残しを新しい画面へ配らない）。
//
// 会話の内容がイベントとして通るが、**ログにもファイルにも書かない**
// （docs/coding-standards.md「会話内容の扱い」）。配る先は渡された {@link EventBatchOptions.deliver} だけ。

import { type StampedEvent } from "../../../shared/session-event.ts"

/**
 * イベントをまとめて配る間隔。**旧の `PUBLISH_INTERVAL_MS` と同じ 100ms**。
 * 書きかけの本文はトークン単位で届くので、1件ずつ押すと転送量が跳ねる。
 */
export const EVENT_BATCH_INTERVAL_MS = 100

/** 時刻を打ったイベントを積み、間隔ごとに1回だけまとめて渡す入れ物。 */
export type EventBatch = {
  /** 1件積む。**待っている配りが無いときだけ**そこから間隔を数え始める。 */
  readonly add: (stamped: StampedEvent) => void
  /** 積んだものを配らずに捨て、待っている配りも取り消す。 */
  readonly discard: () => void
}

export type EventBatchOptions = {
  /** まとめる間隔（ミリ秒）。既定は {@link EVENT_BATCH_INTERVAL_MS}。 */
  readonly intervalMs: number
  /** まとまったイベントを配る先。**1件も無いときは呼ばれない**。 */
  readonly deliver: (events: readonly StampedEvent[]) => void
}

export function createEventBatch(options: EventBatchOptions): EventBatch {
  let buffered: readonly StampedEvent[] = []
  // 配りを待っているタイマー（React の外の資源を持つ可変の入れ物）。
  let timer: ReturnType<typeof setTimeout> | undefined = undefined

  const cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const flush = (): void => {
    timer = undefined
    if (buffered.length === 0) {
      return
    }
    const events = joinPartialUtterances(buffered)
    buffered = []
    options.deliver(events)
  }

  return {
    add: (stamped) => {
      buffered = [...buffered, stamped]
      if (timer === undefined) {
        timer = setTimeout(flush, options.intervalMs)
      }
    },
    discard: () => {
      cancel()
      buffered = []
    },
  }
}

/**
 * 1バッチの中で**連続する書きかけの本文（`partial-utterance`）を1件に連結する**
 * （docs/design.md 3章「依頼」。畳み込みの結果は同じで、転送量だけが減る）。
 * 時刻は連なりの最後の1件のもの（届いた時点に合わせる）。
 */
function joinPartialUtterances(events: readonly StampedEvent[]): readonly StampedEvent[] {
  return events.reduce<readonly StampedEvent[]>((joined, stamped) => {
    const previous = joined[joined.length - 1]
    if (
      previous === undefined ||
      previous.event.kind !== "partial-utterance" ||
      stamped.event.kind !== "partial-utterance"
    ) {
      return [...joined, stamped]
    }

    return [
      ...joined.slice(0, -1),
      {
        at: stamped.at,
        event: { kind: "partial-utterance", text: previous.event.text + stamped.event.text },
      },
    ]
  }, [])
}
