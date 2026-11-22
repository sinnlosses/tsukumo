// `Trace`（作業でした手の並び）を Markdown に戻さず直接描く。

import type { ReactElement } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { Collapsible } from "../../../components/ui/collapsible/collapsible.tsx"
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
} from "../../../components/ui/icon/icon.tsx"
import { List, ListItem } from "../../../components/ui/list/list.tsx"
import { InlineMarkdown } from "../markdown.tsx"
import styles from "./leaf.module.css"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type TraceItem = Extract<A2uiReportComponent, { readonly component: "Trace" }>["items"][number]

const STATUS_MARKS = {
  ok: { icon: <CircleCheckIcon />, label: "済み", className: styles["check-mark-done"] },
  ng: { icon: <CircleXIcon />, label: "落ちた", className: styles["trace-mark-ng"] },
  notStarted: {
    icon: <CircleDashedIcon />,
    label: "未着手",
    className: styles["check-mark-open"],
  },
} as const satisfies Record<
  TraceItem["status"],
  { readonly icon: ReactElement; readonly label: string; readonly className?: string }
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
        <List hasDividers numbered={false} textSize="standard">
          {part.items.map((item, index) => (
            <TraceRow key={`${String(index)}:${item.title}`} item={item} />
          ))}
        </List>
      </LeafFold>
    </ReportLeafFrame>
  )
}

function TraceRow(props: { readonly item: TraceItem }): ReactElement {
  const { title, status, supplement, output } = props.item
  const { icon, label, className } = STATUS_MARKS[status]
  const heading = <InlineMarkdown text={title} />
  return (
    <ListItem
      mark={
        <span className={className} role="img" aria-label={label}>
          {icon}
        </span>
      }
      label={
        output.trim() === "" ? (
          heading
        ) : (
          <Collapsible trigger={heading} defaultOpen={false} chevronPosition="end">
            <pre>{output}</pre>
          </Collapsible>
        )
      }
      description={supplement.trim() !== "" ? supplement : undefined}
    />
  )
}
