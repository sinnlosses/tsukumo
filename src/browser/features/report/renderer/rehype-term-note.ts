// 欄の初出の用語を、点線の語（`button`）と触れるか焦点で出る注の札に替える rehype のプラグイン（サニタイズと行内の印のあと）。
// 語ごとに木の前から最初の1か所だけを替え、2か所目からは字のまま残す。
// `code`・`pre`・`a` と行内の印の中は読まない（初出の決め方 `firstTermPlaces` と同じ範囲）。

import type { Element, ElementContent, Root, RootContent } from "hast"

import type { TermNotes } from "../domain/term-note.ts"
import { isInlineMarkElement } from "./rehype-inline-mark.ts"
import styles from "./report-notation.module.css"

export type RehypeTermNoteOptions = {
  readonly notes: TermNotes
}

const SKIPPED_TAG_NAMES: ReadonlySet<string> = new Set(["code", "pre", "a"])

export function rehypeTermNote(options: RehypeTermNoteOptions): (tree: Root) => Root {
  return (tree) => {
    const placed = new Set<string>()
    const rewriteContent = (node: ElementContent): ElementContent[] => {
      if (node.type === "text") {
        return termNodes(node.value, options.notes, placed)
      }
      if (
        node.type !== "element" ||
        SKIPPED_TAG_NAMES.has(node.tagName) ||
        isInlineMarkElement(node)
      ) {
        return [node]
      }
      return [{ ...node, children: node.children.flatMap(rewriteContent) }]
    }
    return {
      ...tree,
      children: tree.children.flatMap((child): RootContent[] =>
        child.type === "doctype" ? [child] : rewriteContent(child),
      ),
    }
  }
}

/** 字の中のまだ付けていない語を、前から1か所ずつ替える。付けた語は `placed` に足す。 */
function termNodes(value: string, notes: TermNotes, placed: Set<string>): ElementContent[] {
  const [next] = termHits(value, notes, placed)
  const entry = next === undefined ? undefined : notes.get(next.term)
  if (next === undefined || entry === undefined) {
    return [{ type: "text", value }]
  }
  placed.add(next.term)
  const end = next.start + next.term.length
  return [
    ...(next.start > 0 ? [{ type: "text" as const, value: value.slice(0, next.start) }] : []),
    termElement(next.term, entry),
    ...(end < value.length ? termNodes(value.slice(end), notes, placed) : []),
  ]
}

/** 字に出る、まだ付けていない語。前に出る順（同じ位置なら長いほうが先）。 */
function termHits(
  value: string,
  notes: TermNotes,
  placed: ReadonlySet<string>,
): readonly { readonly term: string; readonly start: number }[] {
  return [...notes.keys()]
    .filter((term) => !placed.has(term))
    .map((term) => ({ term, start: value.indexOf(term) }))
    .filter((hit) => hit.start >= 0)
    .toSorted((a, b) => a.start - b.start || b.term.length - a.term.length)
}

function termElement(
  term: string,
  entry: { readonly note: string; readonly cardId: string },
): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: [styles["report-term-note"]] },
    children: [
      {
        type: "element",
        tagName: "button",
        properties: { type: "button", ariaDescribedBy: [entry.cardId] },
        children: [{ type: "text", value: term }],
      },
      {
        type: "element",
        tagName: "span",
        properties: {
          className: [styles["report-term-note-card"]],
          role: "tooltip",
          id: entry.cardId,
        },
        children: [
          {
            type: "element",
            tagName: "span",
            properties: { className: [styles["report-term-note-kind"]] },
            children: [{ type: "text", value: "用語" }],
          },
          { type: "text", value: entry.note },
        ],
      },
    ],
  }
}
