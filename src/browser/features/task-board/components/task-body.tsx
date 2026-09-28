// タスクの本文（Markdown）を、タスクのモーダルの詳細に描く。
//
// 読むのは `remark-gfm`（表・チェック・取り消し線・自動リンク）と `remark-cjk-friendly`（約物の隣の強調）だけ。
// 生の HTML は解釈せず字のまま出す（`rehype-raw` を差さないと、react-markdown は HTML を字に戻す）。
// チェックは `remark-gfm` が出す押せない `<input type="checkbox" disabled>` のまま置く。
// リンクは `http(s)` だけを新しいタブで開き、それ以外（相対パスなど）は字のまま出す。
//
// 見出しは段を下げる（`#`・`##` → `h4`、`###` 以下 → `h5`）。
// モーダルの見出しが `h2`、タスクのタイトルが `h3` なので、本文の `##` をそのまま `h2` にすると段が逆になる。

import type { JSX, ReactElement } from "react"
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown"
import remarkCjkFriendly from "remark-cjk-friendly"
import remarkGfm from "remark-gfm"

import styles from "./task-body.module.css"

/** 同じ参照でないと react-markdown が木を作り直すので、モジュールの定数に置く。 */
const TASK_BODY_COMPONENTS = {
  h1: SectionHeading,
  h2: SectionHeading,
  h3: SubHeading,
  h4: SubHeading,
  h5: SubHeading,
  h6: SubHeading,
  a: Anchor,
  table: Table,
} satisfies Components

export function TaskBody(props: { readonly text: string }): ReactElement {
  return (
    <div className={styles["task-body"]}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCjkFriendly]}
        components={TASK_BODY_COMPONENTS}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  )
}

type HeadingProps = JSX.IntrinsicElements["h2"] & ExtraProps

function SectionHeading(props: HeadingProps): ReactElement {
  return <h4 className={styles["task-body-section"]}>{props.children}</h4>
}

function SubHeading(props: HeadingProps): ReactElement {
  return <h5 className={styles["task-body-sub"]}>{props.children}</h5>
}

type AnchorProps = JSX.IntrinsicElements["a"] & ExtraProps

function Anchor(props: AnchorProps): ReactElement {
  const href = props.href ?? ""
  if (!WEB_URL_PATTERN.test(href)) {
    return <span>{props.children}</span>
  }
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {props.children}
    </a>
  )
}

const WEB_URL_PATTERN = /^https?:\/\//

type TableProps = JSX.IntrinsicElements["table"] & ExtraProps

/** 表は横に溢れたら表だけを転がす（詳細の欄ごと横に広がらないように）。 */
function Table(props: TableProps): ReactElement {
  return (
    <div className={styles["task-body-table-scroll"]}>
      <table>{props.children}</table>
    </div>
  )
}
