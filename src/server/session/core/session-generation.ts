// 駆動1代ぶんの持ち物と、その中の小さな入れ物。起こし直しは `SessionGeneration` を丸ごと作り直す。

import type { SessionEvent } from "../../../shared/session/session-event.ts"
import type { SessionState } from "../../../shared/session/session-state.ts"
import type { SessionDriver } from "../../session-driver/core/session-driver.ts"
import type { TokenUsageRecorder } from "../../token-usage/core/token-usage.ts"
import type { EventBatch } from "./event-batch.ts"
import type { ReportChangeCounter } from "./report-change-count.ts"
import type { WaitingLineAlarm } from "./waiting-line-alarm.ts"

/**
 * 駆動1代ぶんの勘定。
 * イベントを受けるときに見るのはここだけなので、届いたイベントは必ずそれを生んだ代の勘定に積まれる（起こし直しをまたいで混ざらない）。
 */
export type GenerationTally = {
  /** プロセスを起こしてから何代目か（1から）。 */
  readonly generation: number
  /** まとめて配る束（代をまたいで積み残しを配らない）。 */
  readonly batch: EventBatch
  /** トークンの累計と、いま進んでいるターンの内訳。 */
  readonly tokenUsage: TokenUsageRecorder
  /**
   * 起き上がった駆動。閉じるのを待たないために値でも持つ。
   * プロセスの終了は `process.exit` ですぐ進むので、待っていると claude の子プロセスが閉じられずに残る。
   * まだ起き上がっていない・起こせなかったときは `undefined`。
   */
  readonly liveDriver: () => SessionDriver | undefined
  /** 振り返りの書き手を中断する信号。起こし直しで代を閉じたら、書いている最中の問い合わせも中断する。 */
  readonly diarySignal: AbortSignal
  /** そのターンで最後に届いた `report` の結論を預かる入れ物（仕事のときだけ使う）。 */
  readonly pendingConclusion: PendingConclusion
  /** いまのターンにメインが画像のファイルを `Read` したか（`turn-finished` で空に戻す）。 */
  readonly turnImageRead: TurnImageRead
  /** この代で流した `setting-confirmed` の設定ごとの最後の値。 */
  readonly confirmedSettings: ConfirmedSettings
  /** 待ちの一言を出す時刻に `waiting-line-due` を流す目覚まし。代を閉じたら止める。 */
  readonly waitingLineAlarm: WaitingLineAlarm
  /** 依頼の頭の HEAD を控え、`task` のある `report` の変更の札を数える係。 */
  readonly reportChangeCounter: ReportChangeCounter
}

type ConfirmedSettings = {
  /** 同じ値の繰り返しで、畳んでも状態が動かないものなら `true`。 */
  readonly isRepeat: (event: SessionEvent, state: SessionState) => boolean
  readonly note: (event: SessionEvent) => void
}

type TurnImageRead = {
  readonly mark: () => void
  readonly peek: () => boolean
  readonly clear: () => void
}

/**
 * そのターンで最後に届いた `report` の結論を代の勘定に預ける入れ物。
 * 途中の `report` は上書きするだけで、`turn-finished` で読み出して空に戻す
 * （`report` 無しで終わったターンは預けたものが残らず、次のターンへ持ち越さない）。
 */
type PendingConclusion = {
  readonly hold: (conclusion: string) => void
  readonly takeAndClear: () => string | undefined
}

/**
 * 駆動1代ぶんの持ち物。起こし直しはこれを丸ごと作り直すことで、代のあいだだけ意味のある勘定を1つずつ手で空へ戻さない。
 * 代をまたいで残るもの（購読者・棚・コンテキストの内訳を書いたセッションID）はここに入れない。
 */
export type SessionGeneration = GenerationTally & {
  /** 駆動が起き上がるのを待つ口（コマンドを渡す側が待つ）。 */
  readonly driver: Promise<SessionDriver>
  /** 駆動を閉じ、積み残したイベントを捨てる。 */
  readonly close: () => void
  /** 新しい `hello` を配り終えたと知らせ、束を配り始める（起こし直しの代だけが待っている）。 */
  readonly announce: () => void
  /**
   * この代が生きているあいだだけイベントを畳む（駆動由来と同じ扱い）。代を閉じたあとに呼んでも黙って捨てる。
   * 長く続く非同期の処理が、あとから届いたイベントをこの代に固定して流すための口。
   */
  readonly emit: (event: SessionEvent) => void
}

export function createTurnImageRead(): TurnImageRead {
  let read = false
  return {
    mark: () => {
      read = true
    },
    peek: () => read,
    clear: () => {
      read = false
    },
  }
}

export function createPendingConclusion(): PendingConclusion {
  let current: string | undefined = undefined
  return {
    hold: (conclusion) => {
      current = conclusion
    },
    takeAndClear: () => {
      const conclusion = current
      current = undefined
      return conclusion
    },
  }
}

export function createConfirmedSettings(): ConfirmedSettings {
  const last = new Map<string, string>()
  return {
    isRepeat: (event, state) =>
      event.kind === "setting-confirmed" &&
      last.get(event.setting) === event.value &&
      state.settingMarks[event.setting].kind !== "accepted" &&
      (event.setting !== "effort" || state.effort === event.value),
    note: (event) => {
      if (event.kind === "setting-confirmed") {
        last.set(event.setting, event.value)
      }
    },
  }
}
