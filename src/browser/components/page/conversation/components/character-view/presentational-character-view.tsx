// キャラビュー本体の器。立ち絵（<Portrait>）と席のアイテム（<ItemSeats>）を置く。セリフは会話の流れに出るので、ここには吹き出しを置かない。
//
// セリフのログ（<SpeechLog>）の床にも同じ立ち絵を立たせるので、立ち絵と話し手の名前はここから渡す。
//
// 立ち絵の素材（URL）が無いときは `<Portrait>` を出さない。
//
// 狭い画面（760px 以下）では立ち絵の代わりに `<PhoneBalloon>`（顔と最新の1件）を出し、そこからセリフのログを開く（どちらを出すかは CSS の `@media`）。

import type { ReactElement } from "react"

import { Portrait } from "../../../../frame/portrait.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import styles from "./character-view.module.css"
import type { CharacterViewModel } from "./hooks/use-character-view.ts"
import { ItemSeats } from "./item-seat-list.tsx"
import { FailShade, Manpu } from "./manpu.tsx"
import { PhoneBalloon } from "./phone-balloon.tsx"
import { SpeechLog } from "./speech-log.tsx"
type PresentationalCharacterViewProps = CharacterViewModel

const PRESS_TO_NEWEST = "（押すと、いまの一言へ戻る）"
const PRESS_TO_PINNED = "（押すと、選んだ一言の出方をもう一度）"

export function PresentationalCharacterView({
  portraitUrl,
  altText,
  expression,
  motion,
  listeningPose,
  speakerName,
  pinnedSpeech,
  onPortraitPress,
  onToggleSpeech,
  speechLogOpen,
  onOpenSpeechLog,
  onCloseSpeechLog,
  manpu,
  onManpuShown,
  face,
  phoneLine,
  seats,
}: PresentationalCharacterViewProps): ReactElement {
  const portraitProps = {
    altText,
    expression,
    motion,
    className: styles["portrait"],
  }
  const portrait = portraitUrl !== undefined && <Portrait url={portraitUrl} {...portraitProps} />
  // 押せるのは舞台の立ち絵だけ。セリフのログの床に立つ立ち絵は押せない。
  const stagePortrait = portraitUrl !== undefined && (
    <Portrait
      url={portraitUrl}
      {...portraitProps}
      listening={listeningPose}
      overlay={
        manpu.kind === "shown" && manpu.manpu === "shock" ? (
          <FailShade key={manpu.at} url={portraitUrl} />
        ) : undefined
      }
      press={{
        label: `${speakerName ?? altText}${pinnedSpeech === undefined ? PRESS_TO_NEWEST : PRESS_TO_PINNED}`,
        onPress: onPortraitPress,
      }}
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
        onClose={onCloseSpeechLog}
      />
      <PhoneBalloon face={face} line={phoneLine} onOpenLog={onOpenSpeechLog} />
      <div className={styles["character-stage"]} data-character-stage="">
        <HStack
          element="div"
          name={{ kind: "none" }}
          gap="none"
          align="end"
          justify="start"
          wrap="wrap"
          className={styles["character-layout"]}
        >
          {stagePortrait}
        </HStack>
        {portraitUrl !== undefined && manpu.kind === "shown" && (
          <Manpu
            key={manpu.at}
            manpu={manpu.manpu}
            faceAt={manpu.faceAt}
            onShown={(shown) => {
              onManpuShown(shown, manpu.voice)
            }}
          />
        )}
      </div>
      <ItemSeats seats={seats} portraitShown={portraitUrl !== undefined} />
    </VStack>
  )
}
