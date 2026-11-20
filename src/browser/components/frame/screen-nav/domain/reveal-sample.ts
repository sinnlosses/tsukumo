// 設定の演出の面の見本。吹き出しに出す文と、書き上げの塊の分け方、今の値の1行の要約。
// 塊を出す間隔は本番の書き上げと同じ（`popIntervalOf`）。

import type { RevealSpeed } from "../../../../../shared/session/gear-preference.ts"
import type { SpeakingPace } from "../../../../../shared/session/speaking-pace.ts"
import { REVEAL_SPEED_LABELS } from "../../../../domain/reveal-speed.ts"
import { WAITING_LINE_LABELS, labelOfValue } from "./setting-label.ts"

/** キャラクターがまだ何も言っていないときの見本の文。口調を持たない。 */
const NEUTRAL_SAMPLE_TEXT =
  "ここに、セリフやレポートが書き上がっていく様子を見せます。速さを変えると、その速さで書き直します。"

/** 見本の文。最後のセリフがあればそれ、無ければ中立の文。 */
export function sampleTextOf(lastSpeech?: string): string {
  return lastSpeech === undefined || lastSpeech.trim() === "" ? NEUTRAL_SAMPLE_TEXT : lastSpeech
}

/** 句読点・改行の直後で区切った塊。区切りの記号は前の塊に付ける。空の文は塊を持たない。 */
export function sampleChunksOf(text: string): readonly string[] {
  return text.match(/[^。、！？!?\n]+[。、！？!?\n]*|[。、！？!?\n]+/gu) ?? []
}

/** 今のところ見せる塊の数。演出しない（切る・動きを減らす）ときは全部。 */
export function visibleChunkCount(total: number, elapsedChunks: number, instant: boolean): number {
  return instant ? total : Math.min(total, elapsedChunks)
}

/** 吹き出しの下に出す、今の値の要約。 */
export function sampleSummaryOf(revealSpeed: RevealSpeed, pace: SpeakingPace): string {
  const speed = labelOfValue(REVEAL_SPEED_LABELS, revealSpeed)
  const waiting =
    pace.waitingLine === "off"
      ? "待ちの一言は出さない"
      : `待ちの一言は${labelOfValue(WAITING_LINE_LABELS, pace.waitingLine)}黙ったら`
  return `書き上げる速さ「${speed}」・${waiting}`
}
