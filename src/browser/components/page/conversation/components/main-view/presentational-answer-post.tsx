// 答えた質問の投稿の器。札（答え・任せた）を本文の前に並べた短い吹き出しと、
// 吹き出しの外のすぐ下に、いちばん新しい答えだけの「答え直す」。
// 時刻は出さない（質問の記録が時刻を持たない）。

import type { ReactElement } from "react"

import { Button } from "../../../../ui/button/button.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { StreamPostRow } from "../stream-row/stream-row.tsx"
import { USER_SPEAKER_NAME } from "./domain/stream-presentation.ts"
import type { AnswerPostModel } from "./hooks/use-answer-post.ts"
import styles from "./main-view.module.css"

const REDO_LABEL = "答え直す"

type PresentationalAnswerPostProps = AnswerPostModel

export function PresentationalAnswerPost(props: PresentationalAnswerPostProps): ReactElement {
  return (
    <div className={styles["answer-post"]}>
      <StreamPostRow
        time={{ kind: "unknown" }}
        timeShown={false}
        speakerName={USER_SPEAKER_NAME}
        className=""
      >
        <div className={styles["answer-post-body"]}>
          <Text element="span" size="label" tone="ink-quiet" weight="semibold" className="">
            {props.post.stamp}
          </Text>
          <div className={styles["answer-post-lines"]}>
            {props.post.lines.map((line) => (
              <Text
                element="p"
                size="inherit"
                tone="inherit"
                weight="inherit"
                className={styles["answer-post-line"] ?? ""}
                key={line}
              >
                {line}
              </Text>
            ))}
          </div>
        </div>
      </StreamPostRow>
      {props.redo.kind === "offered" && (
        <Button
          variant="link"
          size="secondary"
          pressed="none"
          disabled={false}
          disclosure={{ kind: "none" }}
          title={REDO_LABEL}
          className=""
          onClick={props.redo.onRedo}
        >
          {REDO_LABEL}
        </Button>
      )}
    </div>
  )
}
