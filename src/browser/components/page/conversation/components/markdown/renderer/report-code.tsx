import clsx from "clsx"
import type { JSX, ReactElement, ReactNode } from "react"
import type { ExtraProps } from "react-markdown"

import { optionalString } from "../../../../../../../shared/utils/optional-string.ts"
import {
  breakPathText,
  repositoryFileTarget,
  RepositoryFileLinkTarget,
  useRepositoryFileLink,
} from "../../repository-link/repository-link.tsx"
import { CODE_FILE_PATH_PROPERTY } from "./code-file-name.ts"
import { hastText } from "./code-node.ts"
import { colorSwatch, readColorToken } from "./color-swatch.ts"
import styles from "./report-notation.module.css"

type CodeProps = JSX.IntrinsicElements["code"] & ExtraProps

/**
 * コード（inline code・フェンスの中の `<code>` の両方がここを通る）。
 * 中身の文字が git 管理下の一覧にあるパスなら、押せるボタンで包む（人格の指示が `file_path:line_number` の形で書く inline code）。
 * フェンスの中の複数行のコードは1つのパスと一致しないので、そのまま `<code>` になる（色付け・言語の `className` は変えない）。
 *
 * 中身の文字が1つの色（カラーコードか色のトークン名）なら、その色を地にする（{@link colorSwatch}）。
 */
export function Code(props: CodeProps): ReactElement {
  const { node, children, className, ...rest } = props
  const text = node === undefined ? "" : hastText(node)
  const carriedPath =
    node === undefined ? undefined : optionalString(node.properties[CODE_FILE_PATH_PROPERTY])
  return (
    <CodeSpan
      text={text}
      path={carriedPath ?? text}
      checksSwatch={node !== undefined}
      className={className}
      attributes={rest}
    >
      {children}
    </CodeSpan>
  )
}

/**
 * `Code` の描き分け。`path` が一覧にあるパスなら押せるボタン、`checksSwatch` で `text` が色なら地を塗る。
 * hast の `node` を持たない呼び手（行内の字を直接描く部品）は、字から `text` と `path` を渡す。
 */
export function CodeSpan(props: {
  readonly text: string
  readonly path: string
  readonly checksSwatch: boolean
  readonly className: string | undefined
  readonly attributes: JSX.IntrinsicElements["code"]
  readonly children: ReactNode
}): ReactElement {
  const { text, path, checksSwatch, className, attributes, children } = props
  const link = useRepositoryFileLink()
  const target = repositoryFileTarget(path, link.files)

  if (target === undefined) {
    const swatch = checksSwatch ? colorSwatch(text, readColorToken) : undefined
    return swatch === undefined ? (
      <code className={className} {...attributes}>
        {children}
      </code>
    ) : (
      <code
        {...attributes}
        className={clsx(
          className,
          styles["report-color"],
          styles[`report-color-ink-${swatch.ink}`],
        )}
        style={{ background: swatch.background }}
      >
        {children}
      </code>
    )
  }
  const code = (
    <code className={className} {...attributes}>
      {breakPathText(children, styles["report-path-glue"])}
    </code>
  )
  return (
    <RepositoryFileLinkTarget
      target={target}
      title={undefined}
      className={styles["report-file-link"]}
    >
      {code}
    </RepositoryFileLinkTarget>
  )
}
