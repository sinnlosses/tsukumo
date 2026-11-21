// レポートの畳み（記法が「長い根拠・ログ・脇道」に勧める `<details>` と、内容部品の `fold`）を `ui/` の Collapsible で描く。
// Markdown の `<details>` は `<summary>` の中身を開閉の見出しに、残りを開く側に置く。`open` を持つものは開いた形で始める。

import { Children, isValidElement, type JSX, type ReactElement, type ReactNode } from "react"
import type { ExtraProps } from "react-markdown"

import { Collapsible } from "../../../components/ui/collapsible/collapsible.tsx"
import styles from "./report-notation.module.css"

type ReportDetailsProps = JSX.IntrinsicElements["details"] & ExtraProps

/** `<summary>` が無いときの見出し（ブラウザの既定の「Details」の代わり）。 */
const FALLBACK_TRIGGER = "詳細"

/** Markdown の `<details>`。 */
export function ReportDetails(props: ReportDetailsProps): ReactElement {
  const children = Children.toArray(props.children)
  const summary = children.find(isSummary)
  return (
    <ReportFold
      trigger={summary === undefined ? FALLBACK_TRIGGER : summary.props.children}
      defaultOpen={props.open === true}
    >
      {children.filter((child) => child !== summary)}
    </ReportFold>
  )
}

/** 見出しを押して開く畳み1つ。Markdown の `<details>` と内容部品の `fold` が同じ形になるよう、両方がこれを通る。 */
export function ReportFold(props: {
  readonly trigger: ReactNode
  readonly defaultOpen: boolean
  readonly children: ReactNode
}): ReactElement {
  return (
    <div className={styles["report-details"]}>
      <Collapsible trigger={props.trigger} defaultOpen={props.defaultOpen}>
        {props.children}
      </Collapsible>
    </div>
  )
}

function isSummary(
  child: ReturnType<typeof Children.toArray>[number],
): child is ReactElement<{ readonly children?: ReactNode }, "summary"> {
  return isValidElement(child) && child.type === "summary"
}
