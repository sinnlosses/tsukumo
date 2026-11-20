// 設定の演出の面の頭に置く見本。今のキャラクターの立ち絵と、最後のセリフを今の速さで書き上げる吹き出しを出す。
// 開いたとき・速さを変えたとき・「見本をもう一度」を押したときに書き上げ直す。切る・動きを減らすときは全文をすぐ出す。

import { useState, type ReactElement } from "react"

import type { RevealSpeed } from "../../../../../shared/session/gear-preference.ts"
import type { SpeakingPace } from "../../../../../shared/session/speaking-pace.ts"
import { turnSpeeches } from "../../../../../shared/session/turn-speech.ts"
import { portraitAppearance } from "../../../../domain/portrait-appearance.ts"
import { popIntervalOf } from "../../../../domain/reveal-speed.ts"
import { useExternalSync } from "../../../../hooks/use-external-sync.ts"
import { useSession } from "../../../../stores/session.ts"
import { Text } from "../../../ui/text/text.tsx"
import { Portrait } from "../../portrait.tsx"
import {
  sampleChunksOf,
  sampleSummaryOf,
  sampleTextOf,
  visibleChunkCount,
} from "../domain/reveal-sample.ts"
import styles from "./screen-nav-settings-reveal-sample.module.css"

export type ScreenNavSettingsRevealSampleProps = {
  readonly revealSpeed: RevealSpeed
  readonly reducedMotion: boolean
  readonly pace: SpeakingPace
}

export function ScreenNavSettingsRevealSample(
  props: ScreenNavSettingsRevealSampleProps,
): ReactElement {
  const [round, setRound] = useState(0)
  return (
    <RevealSampleRound
      key={round}
      {...props}
      onAgain={() => {
        setRound((count) => count + 1)
      }}
    />
  )
}

type RevealSampleRoundProps = ScreenNavSettingsRevealSampleProps & {
  readonly onAgain: () => void
}

function RevealSampleRound(props: RevealSampleRoundProps): ReactElement {
  const { revealSpeed, reducedMotion, pace, onAgain } = props
  const character = useSession((session) => session.state.character)
  const lastSpeech = useSession(
    (session) =>
      session.state.speeches.at(-1)?.text ??
      turnSpeeches(session.state.records)
        .findLast((turn) => turn.speeches.length > 0)
        ?.speeches.at(-1)?.text,
  )
  const chunks = sampleChunksOf(sampleTextOf(lastSpeech))
  const instant = revealSpeed === "off" || reducedMotion
  const [elapsed, setElapsed] = useState(0)

  const total = chunks.length

  useExternalSync(() => {
    setElapsed(0)
    if (instant) {
      return undefined
    }
    let ticks = 0
    const timer = setInterval(() => {
      ticks += 1
      setElapsed(ticks)
      if (ticks >= total) {
        clearInterval(timer)
      }
    }, popIntervalOf(revealSpeed))
    return () => {
      clearInterval(timer)
    }
  }, [revealSpeed, instant, total])

  const shown = visibleChunkCount(chunks.length, elapsed, instant)
  const { portraitUrl, altText } = portraitAppearance(character, "default")

  return (
    <div className={styles["sample"]}>
      <div className={styles["stage"]}>
        {portraitUrl !== undefined && (
          <Portrait
            url={portraitUrl}
            altText={altText}
            expression="default"
            className={styles["portrait"]}
          />
        )}
        <div className={styles["bubble"]}>{chunks.slice(0, shown).join("")}</div>
      </div>
      <div className={styles["foot"]}>
        <Text
          element="p"
          size="label"
          tone="ink-quiet"
          weight="inherit"
          className={styles["summary"]}
        >
          {sampleSummaryOf(revealSpeed, pace)}
        </Text>
        <button type="button" className={styles["again"]} onClick={onAgain}>
          見本をもう一度
        </button>
      </div>
    </div>
  )
}
