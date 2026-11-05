// 見本帳の「画面の部品」のうち、会話の画面の舞台（キャラビュー・雑談ビュー・セリフのログ）の例。
// 立ち絵と顔の素材は持たせない（素材の URL が無いときの姿になる）。

import { createRef, type ReactElement, type ReactNode } from "react"

import type { CharacterViewModel } from "../../page/conversation/components/character-view/hooks/use-character-view.ts"
import { PresentationalCharacterView } from "../../page/conversation/components/character-view/presentational-character-view.tsx"
import { PresentationalSpeechLog } from "../../page/conversation/components/character-view/presentational-speech-log.tsx"
import { PresentationalChatView } from "../../page/conversation/components/chat-view/presentational-chat-view.tsx"
import type { ClockStamp } from "../../page/conversation/domain/clock-stamp.ts"
import styles from "./design.module.css"
import type { ScreenPartExample } from "./screen-part-example-type.ts"

const noop = (): void => {}

/** 舞台の部品は親の高さいっぱいに広がるので、1つずつ高さを決めた箱に入れる。 */
function StageBox(props: { readonly children: ReactNode }): ReactElement {
  return <div className={styles["design-stage"]}>{props.children}</div>
}

const TIME: ClockStamp = { kind: "known", dateTime: "2026-01-01T10:00", text: "10:00" }

const NO_FACE = { url: undefined, alt: "さくら" }

const CHARACTER: CharacterViewModel = {
  portraitUrl: undefined,
  altText: "さくら（にこにこ）",
  expression: "default",
  motion: "waiting",
  speeches: [
    { text: "おはよう。今日は何から始める？", time: TIME, selected: false, target: undefined },
    { text: "READMEを見直すね。", time: TIME, selected: true, target: { turnId: 1, index: 1 } },
  ],
  reaction: { kind: "none" },
  speakerName: "さくら",
  pinnedSpeech: undefined,
  onToggleSpeech: noop,
  speechLogOpen: false,
  onOpenSpeechLog: noop,
  onCloseSpeechLog: noop,
  face: NO_FACE,
  phoneLine: { kind: "text", text: "READMEを見直すね。", time: TIME },
  seats: { topLeft: undefined, belowLeft: undefined, belowRight: undefined },
}

export const STAGE_EXAMPLES: readonly ScreenPartExample[] = [
  {
    frame: "flow",
    path: "page/conversation/components/character-view/presentational-character-view.tsx",
    render: () => (
      <>
        <StageBox>
          <PresentationalCharacterView {...CHARACTER} />
        </StageBox>
        <StageBox>
          <PresentationalCharacterView
            {...CHARACTER}
            speeches={[]}
            reaction={{ kind: "writing" }}
            phoneLine={{ kind: "writing" }}
          />
        </StageBox>
      </>
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/character-view/presentational-speech-log.tsx",
    render: () => (
      <PresentationalSpeechLog
        scrollerRef={createRef<HTMLElement>()}
        open={false}
        onOpen={noop}
        onClose={noop}
        portrait={undefined}
        speakerName="さくら"
        userCall="きみ"
        onToggleSpeech={noop}
        entries={[
          {
            kind: "request",
            key: "r1",
            heading: "READMEの手順を見直して",
            requestText: "READMEの手順を見直して",
            time: TIME,
            current: true,
          },
          {
            kind: "speech",
            key: "s1",
            text: "READMEを見直すね。",
            time: TIME,
            age: "latest",
            selected: true,
            target: { turnId: 1, index: 0 },
          },
        ]}
      />
    ),
  },
  {
    frame: "flow",
    path: "page/conversation/components/chat-view/presentational-chat-view.tsx",
    render: () => (
      <>
        <StageBox>
          <PresentationalChatView
            portraitUrl={undefined}
            altText="さくら（にこにこ）"
            expression="default"
            turnInProgress={false}
            onNudge={noop}
            logRef={noop}
            showTyping={false}
            showEmptyMessage={false}
            face={NO_FACE}
            rows={[
              { kind: "day", key: "d1", dateTime: "2026-01-01", label: "今日" },
              { kind: "user", key: "u1", text: "最近どう？", images: [], time: TIME },
              {
                kind: "speech",
                key: "s1",
                text: "元気だよ。きみは？",
                selected: false,
                pop: false,
                time: TIME,
                onToggle: noop,
              },
            ]}
          />
        </StageBox>
        <StageBox>
          <PresentationalChatView
            portraitUrl={undefined}
            altText="さくら（にこにこ）"
            expression="default"
            turnInProgress
            onNudge={noop}
            logRef={noop}
            showTyping
            showEmptyMessage={false}
            face={NO_FACE}
            rows={[]}
          />
        </StageBox>
      </>
    ),
  },
]
