// 1行の字のうち、inline code だけを `code` にして描く（太字やリンクの記法は効かせない）。
// code は Markdown の描画と同じ `CodeSpan` を通るので、押せるパスと色見本も同じに描く。

import { Fragment, type ReactElement } from "react"

import { htmlInlineSegments } from "../../../../../../../shared/report/report-inline-markdown.ts"
import { CodeSpan } from "./report-code.tsx"

export function InlineCodeText(props: { readonly text: string }): ReactElement {
  return (
    <>
      {htmlInlineSegments(props.text).map((segment, index) =>
        segment.kind === "code" ? (
          <CodeSpan
            key={`${String(index)}:code`}
            text={segment.value}
            path={segment.value}
            checksSwatch
            className={undefined}
            attributes={{}}
          >
            {segment.value}
          </CodeSpan>
        ) : (
          <Fragment key={`${String(index)}:text`}>{segment.value}</Fragment>
        ),
      )}
    </>
  )
}
