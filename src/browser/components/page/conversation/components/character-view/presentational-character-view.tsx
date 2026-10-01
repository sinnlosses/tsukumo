// キャラビュー本体の器。立ち絵（<Portrait>）と吹き出しの並び（<BalloonTrack>）を同じ領域に同居させる。
//
// 右上の「ログ」（<SpeechLog>）の床にも同じ立ち絵を立たせるので、立ち絵と話し手の名前はここから渡す。
//
// 立ち絵の素材（URL）が無いときは `<Portrait>` を出さず、吹き出しだけで成立させる。

import type { ReactElement } from "react"

import { Portrait } from "../../../../domain/portrait.tsx"
import { HStack } from "../../../../ui/h-stack/h-stack.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import styles from "./character-view.module.css"
import { BalloonTrack } from "./components/balloon-track/balloon-track.tsx"
import { SpeechLog } from "./components/speech-log/speech-log.tsx"
import type { CharacterViewModel } from "./hooks/use-character-view.ts"

export type PresentationalCharacterViewProps = CharacterViewModel

export function PresentationalCharacterView({
  portraitUrl,
  accent,
  altText,
  expression,
  outfit,
  motion,
  speeches,
  reaction,
  speakerName,
  pinnedSpeech,
  onToggleSpeech,
}: PresentationalCharacterViewProps): ReactElement {
  const portrait = portraitUrl !== undefined && (
    <Portrait
      url={portraitUrl}
      accent={accent}
      altText={altText}
      expression={expression}
      outfit={outfit}
      motion={motion}
      className={styles["portrait"]}
    />
  )
  return (
    <VStack
      element="div"
      name={{ kind: "none" }}
      ref={undefined}
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
      />
      <HStack
        element="div"
        name={{ kind: "none" }}
        ref={undefined}
        gap="none"
        align="end"
        justify="start"
        wrap="wrap"
        className={styles["character-layout"]}
      >
        {portrait}
        <BalloonTrack speeches={speeches} reaction={reaction} speakerName={speakerName} />
      </HStack>
    </VStack>
  )
}
