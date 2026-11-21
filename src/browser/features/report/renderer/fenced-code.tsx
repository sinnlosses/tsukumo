// フェンス付きコード（図・グラフの言語を除く）を描く。ふだんは `CodeBlock` で、前後の見比べの片側だけは行ごとに描く。

import clsx from "clsx"
import type { Element } from "hast"
import { use, type JSX, type ReactElement } from "react"

import { readMarkLines, type CodeMark } from "../../../../shared/report/code-mark.ts"
import { CodeBlock } from "../../../components/ui/code-block/code-block.tsx"
import { List, ListItem } from "../../../components/ui/list/list.tsx"
import { reportExportMark } from "../report-export-copy.ts"
import {
  breakPathText,
  repositoryFileTarget,
  RepositoryFileLinkTarget,
  useRepositoryFileLink,
} from "../repository-link.tsx"
import { CodeLineDiffContext, CodeLines } from "./code-line-list.tsx"
import { splitCodeLines } from "./code-line.ts"
import { codeFileName, codeLanguage, codeMarks, codeSourceText } from "./code-node.ts"
import { CopyButton } from "./copy-button.tsx"
import type { SideLineDiff } from "./line-diff.ts"
import styles from "./report-notation.module.css"
import { shellCommandText, shellLineKinds } from "./shell-line.ts"
import { useCodeStartLine } from "./use-code-start-line.ts"

/** 前後の見比べの片側は行ごとに描いて空きの行で揃え、それ以外は {@link CodeBlock} で描く。 */
export function FencedCode(props: {
  readonly codeNode: Element
  readonly preProps: JSX.IntrinsicElements["pre"]
}): ReactElement {
  const lineDiff = use(CodeLineDiffContext)
  return lineDiff === undefined ? (
    <ReportCodeBlock codeNode={props.codeNode} />
  ) : (
    <ComparedCode codeNode={props.codeNode} preProps={props.preProps} lineDiff={lineDiff} />
  )
}

/**
 * 頭の帯にファイル名、印の行に地、diff の塊に足した行・消した行の地を付ける。
 * 管理下のファイル名は帯の右に開くボタンを置き、始まりの行が分かれば行番号をそこから数える。
 * コマンドの行のある shell の塊は、既定のコピーの代わりにコマンドの行だけを写すボタンを置く。
 */
function ReportCodeBlock(props: { readonly codeNode: Element }): ReactElement {
  const { codeNode } = props
  const fileName = codeFileName(codeNode)
  const marks = codeMarks(codeNode)
  const source = codeSourceText(codeNode)
  const language = codeLanguage(codeNode)
  const kinds = language === undefined ? undefined : shellLineKinds(language, source)
  const isDiff = language === "diff"
  const found = useCodeStartLine({ path: fileName, language: language ?? "", source })
  const startLine = isDiff || kinds !== undefined ? undefined : found
  const labels = markLabels(marks, startLine ?? 1)
  return (
    <div {...reportExportMark.controls} className={styles["report-code-block"]}>
      <CodeBlock
        code={source}
        language={isDiff || language === "text" ? undefined : language}
        title={fileName}
        startLineNumber={startLine}
        highlightLines={markedLines(marks, startLine ?? 1)}
        isDiff={isDiff}
        hasCopyButton={kinds === undefined}
        endContent={
          <>
            {fileName !== undefined && <FileOpenButton fileName={fileName} />}
            {kinds !== undefined && <CopyButton text={shellCommandText(source, kinds)} />}
          </>
        }
      />
      {labels.length > 0 && (
        <List hasDividers={false} numbered={false}>
          {labels.map((label) => (
            <ListItem key={`${label.lines}-${label.text}`} mark={label.lines} label={label.text} />
          ))}
        </List>
      )}
    </div>
  )
}

/** 印の行を、`startLine` から数えたファイルの行番号で並べる。読めない `lines` は数えない。 */
function markedLines(marks: readonly CodeMark[], startLine: number): readonly number[] {
  return marks.flatMap((mark) => {
    const range = readMarkLines(mark.lines)
    return range === undefined
      ? []
      : Array.from(
          { length: range.end - range.start + 1 },
          (_, offset) => startLine + range.start - 1 + offset,
        )
  })
}

/**
 * 印のラベルを、塊の下の一覧に出す形にする。ラベルの空な印は出さない。
 * 行番号は {@link markedLines} と同じく `startLine` から数え、行番号の列と揃える。
 */
function markLabels(
  marks: readonly CodeMark[],
  startLine: number,
): readonly { readonly lines: string; readonly text: string }[] {
  return marks.flatMap((mark) => {
    const range = readMarkLines(mark.lines)
    if (range === undefined || mark.label.trim() === "") {
      return []
    }
    const start = startLine + range.start - 1
    const end = startLine + range.end - 1
    const lines = start === end ? `${String(start)} 行` : `${String(start)}–${String(end)} 行`
    return [{ lines, text: mark.label }]
  })
}

/** 管理下のファイル名なら、押すとエディタで開くボタン。一覧に無ければ何も出さない。 */
function FileOpenButton(props: { readonly fileName: string }): ReactElement {
  const link = useRepositoryFileLink()
  const target = repositoryFileTarget(props.fileName, link.files)

  if (target === undefined) {
    return <></>
  }
  return (
    <span {...reportExportMark.drop}>
      <RepositoryFileLinkTarget
        target={target}
        title={`${props.fileName} を開く`}
        className={styles["report-file-link"]}
      >
        開く
      </RepositoryFileLinkTarget>
    </span>
  )
}

/** 前後の見比べの片側。空きの行で向かいの塊と行の高さを揃えるので、{@link CodeBlock} を使わず行ごとに描く。 */
function ComparedCode(props: {
  readonly codeNode: Element
  readonly preProps: JSX.IntrinsicElements["pre"]
  readonly lineDiff: SideLineDiff
}): ReactElement {
  const { codeNode, preProps: rest } = props
  const fileName = codeFileName(codeNode)
  return (
    <div className={styles["code-file"]}>
      <div className={styles["code-file-name"]}>
        {fileName !== undefined && <FileNameLabel fileName={fileName} />}
        <CopyButton text={codeSourceText(codeNode)} />
      </div>
      <pre {...rest}>
        <code className={clsx(codeNode.properties.className)}>
          <CodeLines lines={splitCodeLines(codeNode.children)} lineDiff={props.lineDiff} />
        </code>
      </pre>
    </div>
  )
}

/** フェンスのファイル名のラベル。一覧にあれば押せるボタン、無ければ素のテキスト。 */
function FileNameLabel(props: { readonly fileName: string }): ReactElement {
  const link = useRepositoryFileLink()
  const target = repositoryFileTarget(props.fileName, link.files)

  if (target === undefined) {
    return <>{props.fileName}</>
  }
  return (
    <RepositoryFileLinkTarget
      target={target}
      title={undefined}
      className={styles["report-file-link"]}
    >
      {breakPathText(props.fileName, styles["report-path-glue"])}
    </RepositoryFileLinkTarget>
  )
}
