// チェックリスト（`- [ ]` / `- [x]`）を、サニタイザを通る済み・未了の目印（`data-task`）へ書き替える rehype のプラグイン。
// サニタイズより前に差す（`rehypePlugins` の並び）。
//
// `remark-gfm` はチェックリストを `<input type="checkbox" disabled>` に変換するが、許可リスト（`REPORT_SANITIZE_SCHEMA`）には操作できる要素が1つも無い。
// `input` を落とし、それを直接持つ `<li>` に目印を移す（`li` の割り当てが印を描く）。
// `li` の外の `input` は、同じ目印の `<span>` に替える（`span` の割り当てが印を描く）。
// 目印の値は許可リストが `done` と `open` だけに絞る。
//
// 書き替えた木はこのあと必ずサニタイザを通る（この層はサニタイズを迂回しない）。
// レポートが直接書いた `<input>` もここで目印に変わり、チェックボックス以外の `input` は許可リストが落とす。

import type { Element, ElementContent, Properties, Root } from "hast"

/** 済み・未了の目印を持たせる hast のプロパティ名（DOM では `data-task`）。 */
export const TASK_PROPERTY = "dataTask"

/** remark-gfm がチェックリストの `ul` / `ol` と `li` に付ける class。見た目を持たないので落とし、記法の class を持たない並びとして描かせる。 */
const GFM_TASK_CLASS_NAMES: readonly string[] = ["contains-task-list", "task-list-item"]

export function rehypeTaskCheck(): (tree: Root) => Root {
  return (tree) => ({
    ...tree,
    children: tree.children.map((child) =>
      child.type === "element" ? rewriteContent(child) : child,
    ),
  })
}

function rewriteContent(node: ElementContent): ElementContent {
  if (node.type !== "element") {
    return node
  }

  if (isTaskCheckbox(node)) {
    return {
      type: "element",
      tagName: "span",
      properties: { [TASK_PROPERTY]: taskState(node.properties) },
      children: [],
    }
  }

  const checkbox = node.tagName === "li" ? node.children.find(isTaskCheckboxContent) : undefined
  if (checkbox !== undefined) {
    return {
      ...node,
      properties: {
        ...withoutGfmTaskClass(node.properties),
        [TASK_PROPERTY]: taskState(checkbox.properties),
      },
      children: node.children.filter((child) => child !== checkbox).map(rewriteContent),
    }
  }

  return {
    ...node,
    properties: withoutGfmTaskClass(node.properties),
    children: node.children.map(rewriteContent),
  }
}

function isTaskCheckboxContent(node: ElementContent): node is Element {
  return node.type === "element" && isTaskCheckbox(node)
}

function isTaskCheckbox(node: Element): boolean {
  const type = node.properties["type"]
  return node.tagName === "input" && typeof type === "string" && type.toLowerCase() === "checkbox"
}

/**
 * `remark-gfm` は `checked` に真偽値を入れる。
 * レポートが直接書いた HTML では属性の値が空文字（`<input type="checkbox" checked>`）になることもあるので、両方を「済み」と見る。
 */
function taskState(properties: Properties): "done" | "open" {
  const checked = properties["checked"]
  return checked === true || checked === "" ? "done" : "open"
}

function withoutGfmTaskClass(properties: Properties): Properties {
  const current = properties["className"]
  if (!Array.isArray(current)) {
    return properties
  }
  const names = current.filter(
    (name) => typeof name !== "string" || !GFM_TASK_CLASS_NAMES.includes(name),
  )
  if (names.length === current.length) {
    return properties
  }
  const { className: _className, ...rest } = properties
  return names.length === 0 ? rest : { ...rest, className: names }
}
