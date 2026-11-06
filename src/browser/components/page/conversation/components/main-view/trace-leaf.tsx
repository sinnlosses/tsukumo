// `Trace`（作業でした手の並び）を Markdown に戻さず直接描く。

import clsx from "clsx"
import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { InlineMarkdown } from "../markdown/markdown.tsx"
import styles from "./main-view.module.css"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type TraceItem = Extract<A2uiReportComponent, { readonly component: "Trace" }>["items"][number]

const STATUS_MARKS = {
  ok: { mark: "✓", label: "済み", className: styles["trace-row-ok"] },
  ng: { mark: "✕", label: "落ちた", className: styles["trace-row-ng"] },
  notStarted: { mark: "○", label: "未着手", className: styles["trace-row-not-started"] },
} as const satisfies Record<
  TraceItem["status"],
  { readonly mark: string; readonly label: string; readonly className?: string }
>

export function TraceLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "Trace") {
    return <></>
  }
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={false}>
        <ol className={styles["trace-leaf"]}>
          {part.items.map((item, index) => (
            <TraceRow key={`${String(index)}:${item.title}`} item={item} />
          ))}
        </ol>
      </LeafFold>
    </ReportLeafFrame>
  )
}

function TraceRow(props: { readonly item: TraceItem }): ReactElement {
  const { title, status, supplement, output } = props.item
  const { mark, label, className } = STATUS_MARKS[status]
  return (
    <li className={clsx(styles["trace-row"], className)}>
      <span className={styles["trace-mark"]} role="img" aria-label={label}>
        {mark}
      </span>
      <span className={styles["trace-title"]}>
        <InlineMarkdown text={title} />
      </span>
      {supplement.trim() !== "" && <span className={styles["trace-supplement"]}>{supplement}</span>}
      {output.trim() !== "" && (
        <details className={styles["trace-output"]}>
          <summary>出力を見る</summary>
          <pre>{output}</pre>
        </details>
      )}
    </li>
  )
}
