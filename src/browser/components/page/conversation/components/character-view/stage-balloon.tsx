// 舞台の「いまの吹き出し」の段。立ち絵の頭のすぐ上に付き、付け根が頭を指す。
// 反応を出していればその1件、無ければ表示中のセリフの最後の1件を、`latest` の吹き出しで出す。
// 吹き出しの下には、いま触っているもの（「手元」）か待っているもの（「待ち」）の行（`hands`）を同じ紙に続ける。
// 出すものが何も無ければ紙ごと畳む（`data-has-balloon` と CSS の `:empty`）。

import type { ReactElement, ReactNode } from "react"

import type { ClockStamp } from "../../domain/clock-stamp.ts"
import { Balloon } from "./balloon.tsx"
import styles from "./character-view.module.css"
import type { BalloonReaction, CharacterViewSpeech } from "./hooks/use-character-view.ts"

const NO_TIME = { kind: "unknown" } satisfies ClockStamp

type StageBalloonProps = {
  /** 古い→新しいの順。最後の1件が、反応が無いときの「いま」。 */
  readonly speeches: readonly CharacterViewSpeech[]
  readonly reaction: BalloonReaction
  readonly speakerName?: string
  readonly onToggleSpeech: (turnId: number, index: number) => void
  /** 吹き出しの下の「手元」「待ち」の行。中身が空なら行ごと畳む。 */
  readonly hands?: ReactNode
}

export function StageBalloon(props: StageBalloonProps): ReactElement {
  const shown = props.reaction.kind !== "none" || props.speeches.length > 0
  return (
    <>
      <div className={styles["stage-say"]} data-has-balloon={shown}>
        {shown && <LatestBalloon key={appearKeyOf(props)} {...props} />}
        <div className={styles["stage-say-hands"]}>{props.hands}</div>
      </div>
      {shown && <i className={styles["stage-say-tail"]} aria-hidden="true" />}
    </>
  )
}

/** 吹き出しの中身が差し替わったときに出入りの動きを掛け直すための key。 */
function appearKeyOf(props: StageBalloonProps): string {
  if (props.reaction.kind === "shown") {
    return `reaction-${props.reaction.reaction}-${props.reaction.text}`
  }
  if (props.reaction.kind === "writing") {
    return "writing"
  }
  return `speech-${String(props.speeches.length)}`
}

function LatestBalloon(props: StageBalloonProps): ReactElement {
  const { reaction, speakerName } = props
  if (reaction.kind === "shown") {
    return (
      <Balloon
        text={reaction.text}
        latest={true}
        speaker={speakerName}
        time={reaction.time}
        interaction={{ kind: "reaction", reaction: reaction.reaction }}
      />
    )
  }
  const speech = props.speeches.at(-1)
  if (reaction.kind === "writing" || speech === undefined) {
    return (
      <Balloon
        text=""
        latest={true}
        speaker={speakerName}
        time={NO_TIME}
        interaction={{ kind: "writing" }}
      />
    )
  }
  return (
    <Balloon
      text={speech.text}
      latest={true}
      speaker={speakerName}
      time={speech.time}
      interaction={{
        kind: "toggleable",
        selected: speech.selected,
        target: speech.target,
        onToggleSpeech: props.onToggleSpeech,
      }}
    />
  )
}
