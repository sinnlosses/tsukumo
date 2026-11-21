// 地の文の箇条書き（記法の class を持たない `ul` / `ol` と、その `li`）を `ui/` の List で描く層。
//
// 記法の容れ物（class を持つ `div`。`with-gutter` を除く）の中の並びは、容れ物の CSS が `ul` / `li` を直に組むので List にしない。
// どちらで描くかは React の文脈で子へ伝える（hast の要素は親を知らないため）。
// `li` は、直の親の並びが List で描かれたときだけ ListItem になる。

import type { Element } from "hast"
import { createContext, use, type ReactElement, type ReactNode } from "react"

import { optionalString } from "../../../../shared/utils/optional-string.ts"
import { CircleCheckIcon, CircleIcon } from "../../../components/ui/icon/icon.tsx"
import { List, ListItem } from "../../../components/ui/list/list.tsx"
import { VisuallyHidden } from "../../../components/ui/visually-hidden/visually-hidden.tsx"
import styles from "./report-notation.module.css"
import { TASK_PROPERTY } from "./task-check.ts"

/** 並びを List で描く場所か（`prose`）、記法の容れ物の中か（`notation`）。 */
const ListPlacementContext = createContext<"prose" | "notation">("prose")

type ParentList = "bullet" | "numbered" | "native"

/** いま描いている `li` の直の親の並び。List で描いたなら印の種類、素の `ul` / `ol` なら `native`。 */
const ParentListContext = createContext<ParentList>("native")

/** 記法の容れ物の中身を包み、中の並びを List にしないようにする。 */
export function NotationListScope(props: { readonly children: ReactNode }): ReactElement {
  return <ListPlacementContext value="notation">{props.children}</ListPlacementContext>
}

/** いまの場所の並びを List で描くか。 */
export function useProseListPlacement(): boolean {
  return use(ListPlacementContext) === "prose"
}

/** 地の文の並び。中の `li` に List の中だと伝える。 */
export function ProseList(props: {
  readonly numbered: boolean
  readonly children: ReactNode
}): ReactElement {
  return (
    <ParentListContext value={props.numbered ? "numbered" : "bullet"}>
      <List hasDividers={false} numbered={props.numbered}>
        {props.children}
      </List>
    </ParentListContext>
  )
}

/** List で描かない並び（素の `ul` / `ol`）の中身を包み、中の `li` を素の `li` に戻す。 */
export function NativeListScope(props: { readonly children: ReactNode }): ReactElement {
  return <ParentListContext value="native">{props.children}</ParentListContext>
}

/** いま描いている `li` の直の親の並び。 */
export function useParentList(): ParentList {
  return use(ParentListContext)
}

/** 地の文の並びの1項目。チェックリストの項目は行頭に済み・未了の印を、ほかは `ul` なら点を置く（`ol` の番号は List が振る）。 */
export function ProseListItem(props: {
  readonly node?: Element
  readonly parent: "bullet" | "numbered"
  readonly children?: ReactNode
}): ReactElement {
  const state = props.node === undefined ? "none" : taskState(props.node)
  return (
    <ListItem
      mark={
        state !== "none" ? (
          <TaskMark state={state} />
        ) : (
          props.parent === "bullet" && <span aria-hidden="true">•</span>
        )
      }
      label={props.children}
    />
  )
}

/** チェックリストの印。済みは成功の色の CircleCheck、未了は控えめな色の Circle。読み上げには「済み」「未了」を渡す。 */
export function TaskMark(props: { readonly state: "done" | "open" }): ReactElement {
  return props.state === "done" ? (
    <span className={styles["report-task-done"]}>
      <CircleCheckIcon />
      <VisuallyHidden element="span">済み</VisuallyHidden>
    </span>
  ) : (
    <span className={styles["report-task-open"]}>
      <CircleIcon />
      <VisuallyHidden element="span">未了</VisuallyHidden>
    </span>
  )
}

/** 要素が持つ済み・未了の目印（チェックリストの項目でなければ `none`）。目印の値は許可リストが `done` と `open` に絞ってある。 */
export function taskState(node: Element): "done" | "open" | "none" {
  const value = optionalString(node.properties[TASK_PROPERTY])
  return value === "done" || value === "open" ? value : "none"
}
