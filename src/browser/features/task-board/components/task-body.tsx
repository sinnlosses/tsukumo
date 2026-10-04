// タスクの本文（Markdown）を、タスクのモーダルの詳細とサイドバーののぞき窓に描く。
//
// 読むのは `remark-gfm`（表・チェック・取り消し線・自動リンク）と `remark-cjk-friendly`（約物の隣の強調）だけ。
// 生の HTML は解釈せず字のまま出す（`rehype-raw` を差さないと、react-markdown は HTML を字に戻す）。
// チェックは `remark-gfm` が出す押せない `<input type="checkbox" disabled>` のまま置く。
// リンクは `http(s)` だけを新しいタブで開き、`taskLinkId` が読める内向きのリンク（本文中の ID の
// 自動リンク）は `onJump` を呼ぶ。それ以外（相対パスなど）は字のまま出す。
//
// 見出しは段を下げる（`#`・`##` → `h4`、`###` 以下 → `h5`）。
// モーダルの見出しが `h2`、タスクのタイトルが `h3` なので、本文の `##` をそのまま `h2` にすると段が逆になる。

import clsx from "clsx"
import type { Nodes } from "mdast"
import type { JSX, ReactElement } from "react"
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type ExtraProps,
} from "react-markdown"
import remarkCjkFriendly from "remark-cjk-friendly"
import remarkGfm from "remark-gfm"

import { linkTaskBodyIds, taskLinkId } from "../domain/task-body-link.ts"
import styles from "./task-body.module.css"

/** `detail` はタスクのモーダルの詳細、`peek` はサイドバーののぞき窓（字を一段小さく組む）。 */
export type TaskBodyTypesetting = "detail" | "peek"

export function TaskBody(props: {
  readonly text: string
  readonly typesetting: TaskBodyTypesetting
  readonly knownIds: ReadonlySet<string>
  readonly onJump: (id: string) => void
}): ReactElement {
  return (
    <div className={clsx(styles["task-body"], TYPESETTING_CLASS[props.typesetting])}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCjkFriendly, remarkTaskLink(props.knownIds)]}
        components={{ ...TASK_BODY_COMPONENTS, a: anchorOf(props.onJump) }}
        urlTransform={taskLinkUrlTransform}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  )
}

const TYPESETTING_CLASS = {
  detail: undefined,
  peek: styles["task-body-peek"],
} satisfies Record<TaskBodyTypesetting, string | undefined>

/**
 * react-markdown の既定の `urlTransform` は知らない URL の仕組み（`javascript:` など）を
 * 落とすため、本文中の ID の自動リンクの `task:` もそのままでは消える。ここだけ通す。
 */
function taskLinkUrlTransform(url: string): string {
  return taskLinkId(url) !== undefined ? url : defaultUrlTransform(url)
}

/** `remark-gfm` などと同じ形（オプションを受け、木を書き換える変換関数を返す）の自作プラグイン。 */
function remarkTaskLink(knownIds: ReadonlySet<string>): () => (tree: Nodes) => void {
  return () => (tree) => linkTaskBodyIds(tree, knownIds)
}

/** `onJump` に依らない部分（`components` の部品の参照が変わると、React がその部品の DOM を作り直すので、モジュールの定数に置く）。 */
const TASK_BODY_COMPONENTS = {
  h1: SectionHeading,
  h2: SectionHeading,
  h3: SubHeading,
  h4: SubHeading,
  h5: SubHeading,
  h6: SubHeading,
  table: Table,
} satisfies Components

type HeadingProps = JSX.IntrinsicElements["h2"] & ExtraProps

function SectionHeading(props: HeadingProps): ReactElement {
  return <h4 className={styles["task-body-section"]}>{props.children}</h4>
}

function SubHeading(props: HeadingProps): ReactElement {
  return <h5 className={styles["task-body-sub"]}>{props.children}</h5>
}

type AnchorProps = JSX.IntrinsicElements["a"] & ExtraProps

/** 本文中の ID の自動リンク（`taskLinkId` が読めるもの）は `onJump` を呼ぶ形の `a` を返す。 */
function anchorOf(onJump: (id: string) => void): (props: AnchorProps) => ReactElement {
  return function Anchor(props: AnchorProps): ReactElement {
    const href = props.href ?? ""
    const jumpId = taskLinkId(href)
    if (jumpId !== undefined) {
      return (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault()
            onJump(jumpId)
          }}
        >
          {props.children}
        </a>
      )
    }
    if (!WEB_URL_PATTERN.test(href)) {
      return <span>{props.children}</span>
    }
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {props.children}
      </a>
    )
  }
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
