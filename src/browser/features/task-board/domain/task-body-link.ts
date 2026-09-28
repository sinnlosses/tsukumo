// タスクの本文（mdast）のうち、いまの一覧に載っている ID と字面が一致する箇所を
// 押せるリンクへ書き換える（`docs/architecture/display.md`「本文中の ID の自動リンク」）。
// 当てるのは地の文と、中身がまるごと1つの ID の inline code だけ。語の途中・フェンスの中は当てない。
// ID の形は決め打ちせず、渡された集合とだけ照らす。
//
// remark プラグインの規約として、渡された木はその場で書き換える（呼び出し側へ複製を返さない）。

import type { Link, Nodes } from "mdast"
import { findAndReplace } from "mdast-util-find-and-replace"
import { visit } from "unist-util-visit"

/** 本文中の ID を指すリンクの URL に付ける印（実際のナビゲーションはしない目印）。 */
const TASK_LINK_SCHEME = "task:"

export function taskLinkUrl(id: string): string {
  return `${TASK_LINK_SCHEME}${id}`
}

/** {@link taskLinkUrl} の逆。指す ID でなければ `undefined`。 */
export function taskLinkId(url: string): string | undefined {
  return url.startsWith(TASK_LINK_SCHEME) ? url.slice(TASK_LINK_SCHEME.length) : undefined
}

export function linkTaskBodyIds(tree: Nodes, knownIds: ReadonlySet<string>): void {
  const pattern = taskIdPattern(knownIds)
  if (pattern === undefined) {
    return
  }

  findAndReplace(
    tree,
    [[pattern, (matched: string) => linkOf(matched, [{ type: "text", value: matched }])]],
    {
      ignore: ["link", "linkReference", "inlineCode", "code"],
    },
  )

  visit(tree, "inlineCode", (node, index, parent) => {
    if (parent === undefined || index === undefined || !knownIds.has(node.value)) {
      return
    }
    parent.children[index] = linkOf(node.value, [node])
  })
}

function linkOf(id: string, children: Link["children"]): Link {
  return { type: "link", url: taskLinkUrl(id), children }
}

/**
 * 既知の ID の字面だけに当たる正規表現。長い ID から並べ（ある ID が別の ID の頭に
 * 一致してしまわないように）、前後が語を作る文字でないときだけ当てる。
 */
function taskIdPattern(knownIds: ReadonlySet<string>): RegExp | undefined {
  if (knownIds.size === 0) {
    return undefined
  }
  const alternatives = [...knownIds]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|")
  return new RegExp(`(?<!\\w)(?:${alternatives})(?!\\w)`, "g")
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
