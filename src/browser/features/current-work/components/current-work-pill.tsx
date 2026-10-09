// 札「いまの作業」と、押すと開く依頼の手順の一覧。
//
// 一覧の id は `useId()` でこの器ごとに振る（狭い画面の頭が開く同じ一覧と `aria-controls` の先が重ならないようにする）。

import { useId, type ReactElement } from "react"

import { Text } from "../../../components/ui/text/text.tsx"
import type { CurrentWork } from "../hooks/use-current-work.ts"
import { CurrentWorkList } from "./current-work-list.tsx"
import styles from "./current-work-pill.module.css"

export type CurrentWorkPillProps = {
  readonly work: CurrentWork
}

export function CurrentWorkPill(props: CurrentWorkPillProps): ReactElement {
  const { work } = props
  // 預け先はここで分解して受ける。
  // `work.toggleRef` の形のまま `ref` に渡すと、`react(refs)` が `work` への参照ごとレンダー中の ref の読み書きとみなして落ちる。
  const { toggleRef } = work
  const listId = useId()

  return (
    <div
      className={styles["current-work"]}
      data-work-state={work.state}
      data-chat-idle={work.chatIdle}
    >
      <button
        type="button"
        ref={toggleRef}
        className={styles["current-work-toggle"]}
        aria-expanded={work.open}
        aria-controls={listId}
        onClick={work.onToggle}
      >
        <span className={styles["current-work-mark"]} aria-hidden="true">
          {work.mark}
        </span>
        <span className={styles["current-work-word"]}>{work.wordLabel}</span>
        {work.phase.kind === "shown" && (
          <>
            <span className={styles["current-work-sep"]} aria-hidden="true" />
            <Text
              element="span"
              size="inherit"
              tone="ink"
              weight="inherit"
              className={styles["current-work-phase"]}
            >
              {work.phase.label}
            </Text>
          </>
        )}
        {work.summary.kind === "text" && (
          <>
            <span className={styles["current-work-sep"]} aria-hidden="true" />
            <Text
              element="span"
              size="inherit"
              tone="inherit"
              weight="inherit"
              className={styles["current-work-summary"]}
            >
              {work.summary.label}
            </Text>
          </>
        )}
      </button>
      {work.open && (
        <CurrentWorkList id={listId} work={work} className={styles["current-work-list-place"]} />
      )}
    </div>
  )
}
