// `ItemList`（箇条・番号・チェック・流れ・カード・名前つきの並び）を Markdown に戻さず直接描く。

import clsx from "clsx"
import type { ReactElement, ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../../../shared/report/report-leaf-value.ts"
import { flowFitsRow, hasFlowDetail } from "../../../../../../shared/report/report-list-markdown.ts"
import {
  FoldedList,
  InlineCodeText,
  InlineMarkdown,
  textLeafClassNames,
} from "../markdown/markdown.tsx"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type ItemListPart = Extract<A2uiReportComponent, { readonly component: "ItemList" }>
type Item = ItemListPart["items"][number]

const BRANCH_TONE_CLASS_NAMES = {
  ok: textLeafClassNames.flowBranchOk,
  warn: textLeafClassNames.flowBranchWarn,
  ng: textLeafClassNames.flowBranchNg,
} as const

export function ItemListLeaf(props: {
  readonly part: A2uiReportComponent
  readonly value: LeafValue
}): ReactElement {
  const { part, value } = props
  if (part.component !== "ItemList") {
    return <></>
  }
  return (
    <ReportLeafFrame value={value} title="" fit={false}>
      <LeafFold fold={part.fold} empty={false}>
        <ItemListBody part={part} />
      </LeafFold>
    </ReportLeafFrame>
  )
}

function ItemListBody(props: { readonly part: ItemListPart }): ReactElement {
  const { style, items } = props.part
  switch (style) {
    case "flow":
      return <FlowList items={items} />
    case "cards":
      return <CardList items={items} />
    case "bullet":
    case "ordered":
    case "check": {
      const list = <PlainList style={style} items={items} />
      return items.some((item) => item.label.trim() !== "") ? (
        <div className={textLeafClassNames.labeledList}>{list}</div>
      ) : (
        list
      )
    }
  }
}

function PlainList(props: {
  readonly style: "bullet" | "ordered" | "check"
  readonly items: readonly Item[]
}): ReactElement {
  const labeled = props.items.some((item) => item.label.trim() !== "")
  const entries = props.items.map((item, index) => (
    <li
      key={`${String(index)}:${item.text}`}
      className={
        props.style === "check" ? clsx("task-list-item", textLeafClassNames.taskItem) : undefined
      }
    >
      {props.style === "check" && (
        <>
          <span
            className={clsx(
              textLeafClassNames.taskCheck,
              item.done && textLeafClassNames.taskCheckDone,
            )}
          >
            {item.done && "✓"}
          </span>{" "}
        </>
      )}
      {labeled ? (
        <>
          <span className={textLeafClassNames.listLabel}>
            <InlineMarkdown text={item.label} />
          </span>
          <span className={textLeafClassNames.listText}>
            <InlineMarkdown text={item.text} />
          </span>
        </>
      ) : (
        <InlineMarkdown text={item.text} />
      )}
    </li>
  ))
  if (props.style === "check") {
    return <ul className="contains-task-list">{entries}</ul>
  }
  return (
    <FoldedList
      renderList={(shown: ReactNode) =>
        props.style === "ordered" ? <ol>{shown}</ol> : <ul>{shown}</ul>
      }
    >
      {entries}
    </FoldedList>
  )
}

function FlowList(props: { readonly items: readonly Item[] }): ReactElement {
  const lastIndex = props.items.length - 1
  const row = flowFitsRow(props.items)
  const detailed = props.items.some(hasFlowDetail)
  return (
    <ol
      className={clsx(
        textLeafClassNames.flow,
        row && textLeafClassNames.flowRow,
        !row && detailed && textLeafClassNames.flowDetailed,
      )}
      aria-label="流れ"
    >
      {props.items.map((item, index) => (
        <li key={`${String(index)}:${item.text}`} className={textLeafClassNames.flowStep}>
          <span className={textLeafClassNames.flowNumber} aria-hidden="true">
            {String(index + 1)}
          </span>
          {index !== lastIndex && (
            <span className={textLeafClassNames.flowRail} aria-hidden="true" />
          )}
          <span>
            {item.label.trim() !== "" && (
              <b>
                <InlineCodeText text={item.label} />
              </b>
            )}
            <InlineCodeText text={item.text} />
            {item.source.trim() !== "" && (
              <span className={textLeafClassNames.flowSource}>
                <InlineCodeText text={item.source} />
              </span>
            )}
            {item.branch.trim() !== "" && (
              <span
                className={clsx(
                  textLeafClassNames.flowBranch,
                  BRANCH_TONE_CLASS_NAMES[item.branchTone],
                )}
              >
                <InlineCodeText text={item.branch} />
              </span>
            )}
          </span>
          {row && index !== lastIndex && (
            <span className={textLeafClassNames.flowArrow} aria-hidden="true">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

function CardList(props: { readonly items: readonly Item[] }): ReactElement {
  return (
    <div className={textLeafClassNames.cards}>
      {props.items.map((item, index) => (
        <div key={`${String(index)}:${item.label}`} className={textLeafClassNames.card}>
          <p>
            <strong>
              <InlineMarkdown text={item.label} />
            </strong>
          </p>
          <p>
            <InlineMarkdown text={item.text} />
          </p>
        </div>
      ))}
    </div>
  )
}
