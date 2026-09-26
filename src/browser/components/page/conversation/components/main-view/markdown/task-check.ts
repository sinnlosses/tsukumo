// チェックリスト（`- [ ]` / `- [x]`）を、サニタイザを通る静的な印へ書き替える rehype の
// プラグイン。サニタイズより前に差す（`markdown.tsx` の `rehypePlugins` の並び）。
//
// なぜ書き替えるのか: `remark-gfm` はチェックリストを `<input type="checkbox" disabled>` に
// 変換するが、許可リスト（`sanitize-schema.ts`）には操作できる要素が1つも無い。`input` を
// そこへ足すと、読むだけの面に焦点の当たる操作部品が並び（押せるように見えて何も起きない）、
// 値の検査も `type` / `checked` / `disabled` の3つに増える。印の `<span>` に畳めば許可リストは
// 読む側の要素だけで済み、済みと未了の区別だけが残る。
//
// 書き替えた木はこのあと必ずサニタイザを通る（この層はサニタイズを迂回しない。だから
// レポートが直接書いた `<input>` もここで印に変わり、チェックボックス以外の `input` は
// 許可リストが落とす）。

import { type Element, type ElementContent, type Properties, type Root } from "hast"

import styles from "./report-notation.module.css"

/** 済みの印として文字で置くもの（色に頼らず、選択・コピー・読み上げでも「済み」と分かる）。 */
const CHECKED_MARK = "✓"

/**
 * `input[type=checkbox]` を印の `<span>` に替え、それを直接持つ `<li>` には行頭の点を消す
 * class を足す（点と印が二重に並ばないように）。
 */
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
    return taskCheckMark(node.properties)
  }

  return {
    ...node,
    properties: isTaskItem(node)
      ? withClassName(node.properties, styles["report-task-item"])
      : node.properties,
    children: node.children.map(rewriteContent),
  }
}

function isTaskCheckbox(node: Element): boolean {
  const type = node.properties["type"]
  return node.tagName === "input" && typeof type === "string" && type.toLowerCase() === "checkbox"
}

function isTaskItem(node: Element): boolean {
  return (
    node.tagName === "li" &&
    node.children.some((child) => child.type === "element" && isTaskCheckbox(child))
  )
}

function taskCheckMark(properties: Properties): Element {
  const checked = isChecked(properties)
  return {
    type: "element",
    tagName: "span",
    properties: {
      className: [
        styles["report-task-check"],
        ...(checked ? [styles["report-task-check-done"]] : []),
      ].flatMap((name) => name ?? []),
    },
    children: checked ? [{ type: "text", value: CHECKED_MARK }] : [],
  }
}

/**
 * `remark-gfm` は `checked` に真偽値を入れる。レポートが直接書いた HTML では属性の値が
 * 空文字（`<input type="checkbox" checked>`）になることもあるので、両方を「済み」と見る。
 */
function isChecked(properties: Properties): boolean {
  const checked = properties["checked"]
  return checked === true || checked === ""
}

function withClassName(properties: Properties, name: string | undefined): Properties {
  if (name === undefined) {
    return properties
  }

  const current = properties["className"]
  const names = Array.isArray(current) ? current : typeof current === "string" ? [current] : []
  return { ...properties, className: [...names, name] }
}
