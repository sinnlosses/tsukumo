// 面の頭の「変更したファイル n」の畳んだ節（樹形図と種別の合計の札）を、値から直接描く。
// 要素・属性・class・text ノードの割れ方は、同じ値を HTML の塊にした `changedFilesMarkdown` を Markdown で描いたものと同じにする。

import clsx from "clsx"
import { Fragment, type ReactElement } from "react"

import type { ChangedFilesView } from "../../../../../../shared/report/changed-file-section.ts"
import type { ChangedFile } from "../../../../../../shared/report/changed-file.ts"
import { FILE_CHANGE_BADGES } from "../../../../../../shared/report/report-file-markdown.ts"
import type { FileTreeRow } from "../../../../../../shared/report/report-file-tree.ts"
import { plainInline } from "../../../../../../shared/report/report-inline-markdown.ts"
import { CodeSpan, filesClassName } from "../markdown/markdown.tsx"

type Files = Extract<ChangedFilesView, { readonly kind: "files" }>
export function ChangedFilesFold(props: { readonly view: Files }): ReactElement {
  const { count, rows, totals } = props.view
  return (
    <details>
      <summary>{`変更したファイル ${String(count)}`}</summary>
      <div className={filesClassName("files")}>
        {rows.map((row, index) => (
          <TreeRow key={`${String(index)}:${row.guide}${row.name}`} row={row} />
        ))}
        <div className={filesClassName("files-summary")}>
          {totals.map(({ change, count: changeCount }) => (
            <ChangeBadge key={change} change={change} suffix={` ${String(changeCount)}`} />
          ))}
        </div>
      </div>
    </details>
  )
}

function TreeRow(props: { readonly row: FileTreeRow<ChangedFile> }): ReactElement {
  const { row } = props
  if (row.kind === "folder") {
    return (
      <div className={filesClassName("file-folder")}>
        <Guide guide={row.guide} />
        <span className={filesClassName("file-path-folder")}>
          <PathText text={plainInline(row.name)} />
        </span>
      </div>
    )
  }
  const { path, change } = row.item
  const name = plainInline(row.name)
  const nameElement = (
    <span className={filesClassName("file-path-name")}>
      <PathText text={name} />
    </span>
  )
  if (row.guide === "" && !path.includes("/")) {
    return (
      <div className={filesClassName("file")}>
        <ChangeBadge change={change} suffix="" />
        <CodeSpan text={name} path={name} checksSwatch className={undefined} attributes={{}}>
          {nameElement}
        </CodeSpan>
        {change === "added" && <AddedNote />}
      </div>
    )
  }
  return (
    <div className={filesClassName("file")}>
      <ChangeBadge change={change} suffix="" />
      <span className={filesClassName("file-entry")}>
        <Guide guide={row.guide} />
        <CodeSpan
          text={name}
          path={path}
          checksSwatch
          className={undefined}
          attributes={{ "data-file-path": path }}
        >
          {nameElement}
        </CodeSpan>
      </span>
      {change === "added" && <AddedNote />}
    </div>
  )
}

/** 説明の無い追加の行の補足。変更ファイルの一覧は説明を持たないので、ほかの種別は何も置かない。 */
function AddedNote(): ReactElement {
  return (
    <span className={clsx(filesClassName("file-note"), filesClassName("file-note-empty"))}>
      新しく作った
    </span>
  )
}

function Guide(props: { readonly guide: string }): ReactElement {
  if (props.guide === "") {
    return <></>
  }
  return (
    <span className={filesClassName("file-branch")} aria-hidden="true">
      {props.guide}
    </span>
  )
}

function ChangeBadge(props: {
  readonly change: ChangedFile["change"]
  readonly suffix: string
}): ReactElement {
  const badge = FILE_CHANGE_BADGES[props.change]
  return (
    <span className={clsx(filesClassName("file-change"), filesClassName(badge.className))}>
      <span className={filesClassName("file-change-symbol")}>{badge.symbol}</span>
      {`${badge.label}${props.suffix}`}
    </span>
  )
}

/** パスの折り返しの機会を `/` の直後だけにする。`/` の後に `wbr`、ハイフンの後に空の `path-glue` を置く。 */
function PathText(props: { readonly text: string }): ReactElement {
  const pieces = props.text.split(/(?<=[/-])/)
  return (
    <>
      {pieces.map((piece, index) => (
        <Fragment key={`${String(index)}:${piece}`}>
          {piece}
          {piece.endsWith("/") && <wbr />}
          {piece.endsWith("-") && <span className={filesClassName("path-glue")} />}
        </Fragment>
      ))}
    </>
  )
}
