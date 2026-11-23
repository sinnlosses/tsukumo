// 依頼を出す部品。見ているやり取りの依頼を、本文の頭に札の列・添えた画像の控え・地の文（広い画面は10行・狭い画面は2行まで）の順で出す。
// 札は slash コマンドとタスク（ID と題）。地の文がその行数で切れたときだけ「全文」が出て、
// 開くと元の文面の全文が出て「畳む」で畳み直す。
// ページの中の本物の `h2` はこの塊の見出し1つ（レポートの `##` は `h4` に落とす）。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import type { TaskSummaryResult } from "../../../../../../shared/repository/task-summary.ts"
import type { MainViewRequest } from "../../../../../../shared/session/main-view-shape.ts"
import { MapBoxBadge } from "../../../../../features/architecture-map/map-box-badge.tsx"
import { Button } from "../../../../ui/button/button.tsx"
import { Heading } from "../../../../ui/heading/heading.tsx"
import { Text } from "../../../../ui/text/text.tsx"
import { PromptImageThumbnails } from "../prompt-image/prompt-image.tsx"
import { requestChips } from "./domain/request-chip-split.ts"
import { turnRequestLines } from "./domain/turn-title.ts"
import { useClamped } from "./hooks/use-clamped.ts"
import styles from "./main-view.module.css"

const REQUEST_LABEL = "依頼"
const OPEN_LABEL = "全文"
const COLLAPSE_LABEL = "畳む"

type RequestBlockProps = {
  readonly request: MainViewRequest
  readonly tasks: TaskSummaryResult
}

export function RequestBlock(props: RequestBlockProps): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const { ref, clamped } = useClamped<HTMLParagraphElement>()
  const chips = requestChips(props.request.text, props.tasks)
  const images = props.request.images
  const hasChips =
    chips.command !== undefined || chips.mapBox !== undefined || chips.tasks.length > 0
  const full = turnRequestLines(props.request).join("\n")
  const hasProse = chips.prose !== ""

  return (
    <section className={styles["request-block"]}>
      <Heading
        level={2}
        size="secondary"
        tone="ink-quiet"
        weight="normal"
        className={styles["request-label"]}
      >
        {REQUEST_LABEL}
      </Heading>
      {hasChips && (
        <div className={styles["request-chips"]}>
          {chips.mapBox !== undefined && <MapBoxBadge badge={chips.mapBox} />}
          {chips.command !== undefined && (
            <Chip className={styles["is-command"] ?? ""}>{chips.command}</Chip>
          )}
          {chips.tasks.map((task) => (
            <span key={task.id} className={styles["request-chip-group"]}>
              <Chip className={styles["is-task"]}>{task.id}</Chip>
              <Chip className="">{task.summary}</Chip>
            </span>
          ))}
        </div>
      )}
      <PromptImageThumbnails images={images} />
      {(hasProse || expanded) && (
        <div className={styles["request-row"]}>
          <p className={clsx(styles["request-lines"], expanded && styles["is-expanded"])} ref={ref}>
            <Text element="span" size="inherit" tone="inherit" weight="inherit" className="">
              {expanded ? full : chips.prose}
            </Text>
          </p>
          {(expanded || clamped) && (
            <Button
              variant="text-accent"
              size="action"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "expander", expanded }}
              className={styles["request-more"]}
              onClick={() => {
                setExpanded(!expanded)
              }}
            >
              <span
                className={clsx(styles["request-chevron"], expanded && styles["is-expanded"])}
                aria-hidden="true"
              />
              {expanded ? COLLAPSE_LABEL : OPEN_LABEL}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

type ChipProps = {
  readonly className: string
  readonly children: string
}

function Chip(props: ChipProps): ReactElement {
  return (
    <span className={clsx(styles["request-chip"], props.className)}>
      <Text element="span" size="label" tone="inherit" weight="inherit" className="">
        {props.children}
      </Text>
    </span>
  )
}
