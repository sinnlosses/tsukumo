// `Code` の塊を、フェンスを書かずに `Pre` へ渡すための hast。
// 塊の言語・パス・印から、Markdown が作るのと同じ形（`pre > code`）を手で組む。色付けは掛けない。

import type { Element, Root } from "hast"

import { type CodeMark, marksToken } from "../../../../../../../shared/report/code-mark.ts"
import { CODE_FILE_NAME_PROPERTY, CODE_MARKS_PROPERTY } from "./code-file-name.ts"

type CodeFenceInput = {
  readonly language: string
  readonly path: string
  readonly marks: readonly CodeMark[]
  readonly source: string
}

/**
 * 言語は先頭の語が class になり、空でパスか印があれば `text` で埋める（旧い info の読みと同じ）。
 * 言語の先頭の語より後ろは、パスの前に付くファイル名の一部になる。
 */
export function codeFenceTree(input: CodeFenceInput): Root {
  const [first = "", ...extra] = input.language.trim().split(/\s+/)
  const fileName = [...extra, input.path.trim()].filter((word) => word !== "").join(" ")
  const hasAttributes = fileName !== "" || input.marks.length > 0
  const language = first === "" && hasAttributes ? "text" : first
  const code: Element = {
    type: "element",
    tagName: "code",
    properties: {
      ...(language === "" ? {} : { className: [`language-${language}`] }),
      ...(fileName === "" ? {} : { [CODE_FILE_NAME_PROPERTY]: fileName }),
      ...(input.marks.length === 0 ? {} : { [CODE_MARKS_PROPERTY]: marksToken(input.marks) }),
    },
    children: [{ type: "text", value: `${input.source.replace(/\n$/, "")}\n` }],
  }
  return {
    type: "root",
    children: [{ type: "element", tagName: "pre", properties: {}, children: [code] }],
  }
}
