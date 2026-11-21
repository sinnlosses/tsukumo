// `ItemList`（箇条・番号・チェック・流れ・カード・名前つきの並び）を Markdown に戻さず直接描く。

import type { ReactElement, ReactNode } from "react"

import type { A2uiReportComponent } from "../../../../shared/report/a2ui-report-catalog.ts"
import type { LeafValue } from "../../../../shared/report/report-leaf-value.ts"
import { Badge } from "../../../components/ui/badge/badge.tsx"
import { CircleCheckIcon, CircleIcon } from "../../../components/ui/icon/icon.tsx"
import { List, ListItem } from "../../../components/ui/list/list.tsx"
import { Step, Stepper } from "../../../components/ui/stepper/stepper.tsx"
import { flowFitsRow } from "../domain/report-list-markdown.ts"
import { FoldedList, InlineCodeText, InlineMarkdown, textLeafClassNames } from "../markdown.tsx"
import styles from "./leaf.module.css"
import { LeafFold, ReportLeafFrame } from "./report-leaf-frame.tsx"

type ItemListPart = Extract<A2uiReportComponent, { readonly component: "ItemList" }>
type Item = ItemListPart["items"][number]

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
    case "check":
      return <PlainList style={style} items={items} />
  }
}

function PlainList(props: {
  readonly style: "bullet" | "ordered" | "check"
  readonly items: readonly Item[]
}): ReactElement {
  const entries = props.items.map((item, index) => (
    <ListItem
      key={`${String(index)}:${item.text}`}
      mark={
        props.style === "check" ? (
          <CheckMark done={item.done} />
        ) : props.style === "bullet" ? (
          <span aria-hidden="true">•</span>
        ) : undefined
      }
      label={
        item.label.trim() !== "" ? (
          <>
            <strong className={styles["item-name"]}>
              <InlineMarkdown text={item.label} />
            </strong>
            <InlineMarkdown text={item.text} />
          </>
        ) : (
          <InlineMarkdown text={item.text} />
        )
      }
    />
  ))
  const numbered = props.style === "ordered"
  if (props.style === "check") {
    return (
      <List hasDividers={false} numbered={false}>
        {entries}
      </List>
    )
  }
  return (
    <FoldedList
      renderList={(shown: ReactNode) => (
        <List hasDividers={false} numbered={numbered}>
          {shown}
        </List>
      )}
    >
      {entries}
    </FoldedList>
  )
}

function CheckMark(props: { readonly done: boolean }): ReactElement {
  return props.done ? (
    <span className={styles["check-mark-done"]}>
      <CircleCheckIcon />
    </span>
  ) : (
    <span className={styles["check-mark-open"]}>
      <CircleIcon />
    </span>
  )
}

function FlowList(props: { readonly items: readonly Item[] }): ReactElement {
  return (
    <Stepper
      activeStep={-1}
      label="流れ"
      orientation={flowFitsRow(props.items) ? "horizontal" : "vertical"}
    >
      {props.items.map((item, index) => (
        <Step
          key={`${String(index)}:${item.text}`}
          step={index}
          label={item.label}
          alwaysNumbered
          end={
            item.branch.trim() !== "" && (
              <Badge tone={item.branchTone} shape="square" className={styles["verdict-badge"]}>
                <InlineCodeText text={item.branch} />
              </Badge>
            )
          }
        >
          <InlineCodeText text={item.text} />
          {item.source.trim() !== "" && (
            <span className={styles["flow-source"]}>
              <InlineCodeText text={item.source} />
            </span>
          )}
        </Step>
      ))}
    </Stepper>
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
