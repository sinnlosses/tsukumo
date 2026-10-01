// 依頼前のメインビューの中身。見出しと、押すと入力欄の下書きに依頼が入る口を出す。

import type { ReactElement } from "react"

import { Button } from "../../../../../../ui/button/button.tsx"
import { Heading } from "../../../../../../ui/heading/heading.tsx"
import { Text } from "../../../../../../ui/text/text.tsx"
import type { WelcomeDoor } from "./domain/welcome-entries.ts"
import { useWelcome } from "./hooks/use-welcome.ts"
import styles from "./welcome.module.css"

const TITLE = "何から始める？"
const LEAD_WITH_DOORS = "口を押すと、下の入力欄に依頼の文が入る（送るのは自分で）。"
const LEAD_WITHOUT_DOORS = "下の入力欄から頼める。"

export function Welcome(): ReactElement {
  const { entries, onChoose } = useWelcome()
  const hasDoors = entries.resume.length > 0 || entries.tasks.length > 0

  return (
    <div className={styles["welcome"]}>
      <Heading level={2} size="heading" tone="ink" weight="bold" className={styles["title"]}>
        {TITLE}
      </Heading>
      <Text
        element="p"
        size="subheading"
        tone="ink-quiet"
        weight="inherit"
        className={styles["lead"]}
      >
        {hasDoors ? LEAD_WITH_DOORS : LEAD_WITHOUT_DOORS}
      </Text>
      {hasDoors && (
        <div className={styles["groups"]}>
          <DoorGroup title="前回の続き" doors={entries.resume} mono={false} onChoose={onChoose} />
          <DoorGroup title="次に着手できるタスク" doors={entries.tasks} mono onChoose={onChoose} />
        </div>
      )}
    </div>
  )
}

type DoorGroupProps = {
  readonly title: string
  readonly doors: readonly WelcomeDoor[]
  /** 見出しの字（タスクの ID）を等幅で出すか。 */
  readonly mono: boolean
  readonly onChoose: (request: string) => void
}

function DoorGroup(props: DoorGroupProps): ReactElement | undefined {
  if (props.doors.length === 0) {
    return undefined
  }
  return (
    <section className={styles["group"]} aria-label={props.title}>
      <Heading level={3} size="secondary" tone="ink-quiet" weight="normal" className="">
        {props.title}
      </Heading>
      {props.doors.map((door) => (
        <Button
          key={door.key}
          variant="outline-surface"
          size="subheading"
          pressed="none"
          disabled={false}
          ariaLabel={undefined}
          ariaHasPopup={undefined}
          disclosure={{ kind: "none" }}
          title={door.detail === "" ? undefined : `${door.label} ${door.detail}`}
          className={styles["door"]}
          onClick={() => {
            props.onChoose(door.request)
          }}
        >
          <span className={props.mono ? styles["door-id"] : styles["door-label"]}>
            {door.label}
          </span>
          {door.detail !== "" && <span className={styles["door-detail"]}>{door.detail}</span>}
        </Button>
      ))}
    </section>
  )
}
