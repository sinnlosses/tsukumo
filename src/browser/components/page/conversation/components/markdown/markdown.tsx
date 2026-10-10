// レポートの Markdown の描画一式（react-markdown・highlight.js など）を、初期読み込みの束から `import()` で外して読む口。
// 使い手はここの部品を使い、描画一式のモジュールを直接 import しない（直接 import すると一式が入口の束に戻る）。
//
// 読み終わるまでは高さを持たない空の器に `aria-busy="true"` を出す。
// 読めなかったときは本文を字のまま出し、`aria-busy` を出さない。

import type { ReactElement } from "react"

import { deferredModule } from "../../../../../hooks/deferred-module.ts"
import styles from "./markdown.module.css"
import type { MarkdownProps, QuestionPreviewMarkdownProps } from "./renderer/markdown-renderer.tsx"
import notationStyles from "./renderer/report-notation.module.css"

const markdownRenderer = deferredModule(() => import("./renderer/markdown-renderer.tsx"))

/** レポート本文と質問の preview の入れ物の class 名。外の部品が自分の要素に重ねて付ける。 */
export const detailBlockClassName = notationStyles["detail-block"]

/** 描画一式を読み込む。何度呼んでも読み込みは1回で、済めば待っている部品が描き直る。 */
export const loadMarkdown = markdownRenderer.load

/** レポート1件分（または塊1つ）の Markdown。 */
export function Markdown(props: MarkdownProps): ReactElement {
  const state = markdownRenderer.useLoadState()
  switch (state.kind) {
    case "loading":
      return <PendingMarkdown />
    case "failed":
      return <PlainText text={props.text} />
    case "ready":
      return <state.module.Markdown text={props.text} />
  }
}

/** 質問の選択肢の `preview` の Markdown。 */
export function QuestionPreviewMarkdown(props: QuestionPreviewMarkdownProps): ReactElement {
  const state = markdownRenderer.useLoadState()
  switch (state.kind) {
    case "loading":
      return <PendingMarkdown />
    case "failed":
      return <PlainText text={props.text} />
    case "ready":
      return <state.module.QuestionPreviewMarkdown text={props.text} toolUseId={props.toolUseId} />
  }
}

function PendingMarkdown(): ReactElement {
  return <div aria-busy="true" />
}

function PlainText(props: { readonly text: string }): ReactElement {
  return <p className={styles["plain-text"]}>{props.text}</p>
}
