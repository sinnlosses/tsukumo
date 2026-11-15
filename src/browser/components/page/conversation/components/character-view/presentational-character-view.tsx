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
import { PhoneBalloon } from "./phone-balloon.tsx"
import { SpeechLog } from "./speech-log.tsx"

type PresentationalCharacterViewProps = CharacterViewModel

export function PresentationalCharacterView({
  portraitUrl,
  altText,
  expression,
  motion,
  speakerName,
  pinnedSpeech,
  onToggleSpeech,
  speechLogOpen,
  onOpenSpeechLog,
  onCloseSpeechLog,
  face,
  phoneLine,
  seats,
}: PresentationalCharacterViewProps): ReactElement {
  const portrait = portraitUrl !== undefined && (
    <Portrait
      url={portraitUrl}
      altText={altText}
      expression={expression}
      motion={motion}
      className={styles["portrait"]}
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
        </HStack>
      </div>
      <ItemSeats seats={seats} portraitShown={portraitUrl !== undefined} />
    </VStack>
  )
}
