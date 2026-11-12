// キャラビュー本体の器。立ち絵（<Portrait>）と吹き出しの並び（<BalloonTrack>）を同じ領域に同居させる。
//
// 右上の「ログ」（<SpeechLog>）の床にも同じ立ち絵を立たせるので、立ち絵と話し手の名前はここから渡す。
//
// 立ち絵の素材（URL）が無いときは `<Portrait>` を出さず、吹き出しだけで成立させる。
//
// 狭い画面（760px 以下）では立ち絵と吹き出しの並びの代わりに `<PhoneBalloon>`（顔と最新の1件）を出す（どちらを出すかは CSS の `@media`）。
//
// 新しい器の舞台（`placement` が `stage`）では、立ち絵を舞台の下端に立たせ、その上に5段の置き場を積む。
// 段は上から部屋の頭・今日の灯り・やり取りの流れ・いまの吹き出し・立ち絵で、`data-slot` で名乗る。

import type { CSSProperties, ReactElement, ReactNode } from "react"

import type {
  CharacterStage,
  StageFadeEdge,
} from "../../../../../../shared/character-pack/character-stage.ts"
import { Portrait } from "../../../../frame/portrait.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import { BalloonTrack } from "./balloon-track.tsx"
import styles from "./character-view.module.css"
import type { CharacterViewModel } from "./hooks/use-character-view.ts"
import { ItemSeats } from "./item-seat-list.tsx"
import { PhoneBalloon } from "./phone-balloon.tsx"
import { SpeechLog } from "./speech-log.tsx"
import { StageBalloon } from "./stage-balloon.tsx"

/** 旧い器のキャラビューの領域に置くか、新しい器の舞台に置くか。 */
export type CharacterViewPlacement = "classic" | "stage"

type PresentationalCharacterViewProps = CharacterViewModel & {
  readonly hands?: ReactNode
  /** 舞台の吹き出しの下に出す「手元」「待ち」の行。 */
  readonly stageHands?: ReactNode
  /** 舞台のいちばん上の段に置く部屋の頭。 */
  readonly roomHead?: ReactNode
  readonly placement?: CharacterViewPlacement
}

export function PresentationalCharacterView({
  portraitUrl,
  altText,
  expression,
  motion,
  speeches,
  reaction,
  speakerName,
  pinnedSpeech,
  onToggleSpeech,
  speechLogOpen,
  onOpenSpeechLog,
  onCloseSpeechLog,
  face,
  phoneLine,
  seats,
  stage,
  hands,
  stageHands,
  roomHead,
  placement = "classic",
}: PresentationalCharacterViewProps): ReactElement {
  const portraitIn = (className?: string): ReactNode =>
    portraitUrl !== undefined && (
      <Portrait
        url={portraitUrl}
        altText={altText}
        expression={expression}
        motion={motion}
        className={className}
      />
    )
  const portrait = portraitIn(styles["portrait"])
  const balloons = (
    <BalloonTrack
      speeches={speeches}
      reaction={reaction}
      speakerName={speakerName}
      onToggleSpeech={onToggleSpeech}
    />
  )
  return (
    <VStack
      element="div"
      name={{ kind: "none" }}
      gap="sm"
      align="stretch"
      justify="start"
      wrap="nowrap"
      className={styles["character-region"]}
    >
      <SpeechLog
        portrait={portrait}
        speakerName={speakerName}
        pinnedSpeech={pinnedSpeech}
        onToggleSpeech={onToggleSpeech}
        open={speechLogOpen}
        onOpen={onOpenSpeechLog}
        onClose={onCloseSpeechLog}
      />
      <PhoneBalloon face={face} line={phoneLine} onOpenLog={onOpenSpeechLog} hands={hands} />
      {placement === "stage" ? (
        <StageFigure
          stage={stage}
          portrait={portraitIn(styles["stage-figure-portrait"])}
          roomHead={roomHead}
          thread={
            <BalloonTrack
              speeches={reaction.kind === "none" ? speeches.slice(0, -1) : speeches}
              reaction={reaction}
              speakerName={speakerName}
              onToggleSpeech={onToggleSpeech}
              withoutLatest={true}
            />
          }
          balloon={
            <StageBalloon
              speeches={speeches}
              reaction={reaction}
              speakerName={speakerName}
              onToggleSpeech={onToggleSpeech}
              hands={stageHands}
            />
          }
        />
      ) : (
        <div className={styles["character-stage"]}>
          <HStack
            element="div"
            name={{ kind: "none" }}
            gap="none"
            align="end"
            justify="start"
            wrap="wrap"
            className={styles["character-layout"]}
          >
            {portrait}
            {balloons}
          </HStack>
        </div>
      )}
      <ItemSeats seats={seats} portraitShown={portraitUrl !== undefined} />
    </VStack>
  )
}

/**
 * 舞台の5段。立ち絵の席を先に置くのは、上の4段の下端が立ち絵の頭の印を anchor で引くため（参照元が DOM で先にないと効かない）。
 * 立ち絵が無いときも頭の印は残し、上の4段は既定の高さで立ち絵の場所の上に止まる。
 */
function StageFigure(props: {
  readonly stage: CharacterStage
  readonly portrait: ReactNode
  readonly roomHead: ReactNode
  readonly thread: ReactNode
  readonly balloon: ReactNode
}): ReactElement {
  return (
    <div className={styles["stage-figure"]} style={stageFigureStyle(props.stage)}>
      <div className={styles["stage-figure-seat"]} data-slot="portrait">
        {props.portrait}
        <span className={styles["stage-figure-head"]} aria-hidden="true" />
      </div>
      <div className={styles["stage-figure-rows"]}>
        <div className={styles["stage-figure-room-head"]} data-slot="room-head">
          {props.roomHead}
        </div>
        <div className={styles["stage-figure-today"]} data-slot="today" />
        <div className={styles["stage-figure-thread"]} data-slot="thread">
          {props.thread}
        </div>
        <div className={styles["stage-figure-balloon"]} data-slot="balloon">
          {props.balloon}
        </div>
      </div>
    </div>
  )
}

function stageFigureStyle(stage: CharacterStage): CSSProperties {
  const fade = stage.fade.map((edge) => FADE_GRADIENT[edge])
  return {
    "--stage-figure-left": `${String(stage.left * 100)}%`,
    "--stage-figure-width": `${String(stage.width * 100)}%`,
    "--stage-figure-head": `${String(stage.head * 100)}%`,
    "--stage-figure-fade": fade.length === 0 ? "none" : fade.join(", "),
  }
}

/** 縁を透明へ抜くマスク。重ねた分は `mask-composite: intersect` で掛け合わせる。 */
const FADE_GRADIENT = {
  top: "linear-gradient(180deg, transparent, black 18%)",
  right: "linear-gradient(270deg, transparent, black 20%)",
  bottom: "linear-gradient(0deg, transparent, black 12%)",
  left: "linear-gradient(90deg, transparent, black 12%)",
} as const satisfies Record<StageFadeEdge, string>
