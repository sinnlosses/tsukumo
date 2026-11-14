// 依頼を出す部品。見ているやり取りの依頼を、本文の頭に札の列と2行までの地の文で出す。
// 札は slash コマンド・タスク（ID と題）・添えた画像の縮小版。地の文が3行以上のときだけ「全文」が出て、
// 開くと元の文面の全文と画像が出て「畳む」で畳み直す。
// ページの中の本物の `h2` はこの塊の見出し1つ（レポートの `##` は `h4` に落とす）。

import clsx from "clsx"
import { useState, type ReactElement } from "react"

import type { TaskSummaryResult } from "../../../../../../shared/repository/task-summary.ts"
import type { MainViewRequest } from "../../../../../../shared/session/main-view-shape.ts"
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

/** 札の列に縮小版で並べる画像の上限。残りは「+n」の札にする。 */
const MAX_THUMBNAILS = 3

type RequestBlockProps = {
  readonly request: MainViewRequest
  readonly tasks: TaskSummaryResult
}

export function RequestBlock(props: RequestBlockProps): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const { ref, clamped } = useClamped<HTMLParagraphElement>()
  const chips = requestChips(props.request.text, props.tasks)
  const images = props.request.images
  const hasChips = chips.command !== undefined || chips.tasks.length > 0 || images.length > 0
  const hiddenImageCount = Math.max(0, images.length - MAX_THUMBNAILS)
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
          {chips.command !== undefined && (
            <Chip className={styles["is-command"] ?? ""}>{chips.command}</Chip>
          )}
          {chips.tasks.map((task) => (
            <span key={task.id} className={styles["request-chip-group"]}>
              <Chip className={styles["is-task"]}>{task.id}</Chip>
              <Chip className="">{task.summary}</Chip>
            </span>
          ))}
          <PromptImageThumbnails images={images.slice(0, MAX_THUMBNAILS)} size="chip" />
          {hiddenImageCount > 0 && (
            <Button
              variant="outline-ground"
              size="label"
              pressed="none"
              disabled={false}
              disclosure={{ kind: "none" }}
              className={styles["request-more-images"]}
              onClick={() => {
                setExpanded(true)
              }}
            >
              {`+${String(hiddenImageCount)}`}
            </Button>
          )}
        </div>
      )}
      {(hasProse || expanded) && (
        <div className={styles["request-row"]}>
          <p className={clsx(styles["request-lines"], expanded && styles["is-expanded"])} ref={ref}>
            <Text element="span" size="secondary" tone="inherit" weight="inherit" className="">
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
      {expanded && <PromptImageThumbnails images={images} size="full" />}
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
