// フェンスの info 文字列に書いたファイル名（```diff src/foo.ts の `src/foo.ts`）を、hast の `code` 要素の属性へ移す rehype のプラグイン。
// rehype-raw より前に差す（`rehypePlugins` の並び）。
//
// mdast-util-to-hast が `className`（`language-diff`）にするのは info 文字列の先頭の語だけで、残りは要素の `data.meta` に置く。
// `data` は属性ではないので、hast-util-raw（rehype-raw）が木を HTML へ書き出して読み直す時点で落ちる（実測）。
// 属性にしておけば書き出し・読み直しを越え、サニタイザ（`code` の許可）を通って `Pre` まで届く。
//
// 中身は解釈せず、前後の空白を落としてそのまま運ぶ（記法は「パスを1つ」と決めているが、それ以外が来たときも読み手に見せたほうが手掛かりになる）。

import type { Element, ElementContent, Properties, Root } from "hast"

import { splitMarksToken } from "../../../../../../../shared/report/code-mark.ts"

/**
 * `code` の塊の `marks` を運ぶプロパティ名（DOM の属性名は `data-marks`。中身は `encodeMarks` の `marks=` を除いた部分）。
 * info の末尾の語を切り離して運ぶので、ファイル名には混ざらない。
 */
export const CODE_MARKS_PROPERTY = "dataMarks"

/**
 * ファイル名を運ぶ hast のプロパティ名（DOM に出るときの属性名は `data-filename`）。
 * サニタイザの許可リストと `Pre` が同じ名前で受けるので、綴りを1箇所に置く。
 */
export const CODE_FILE_NAME_PROPERTY = "dataFilename"

/**
 * `files` の塊の `code` が、表示するファイル名とは別に運ぶフルパスのプロパティ名（DOM の属性名は `data-file-path`）。
 * 押せるボタンにするかの判定は、中身の文字ではなくこのフルパスで行う。
 */
export const CODE_FILE_PATH_PROPERTY = "dataFilePath"

/** `code` 要素の `data.meta` を {@link CODE_FILE_NAME_PROPERTY} の属性へ写す。 */
export function rehypeCodeFileName(): (tree: Root) => Root {
  return (tree) => ({
    ...tree,
    children: tree.children.map((child) =>
      child.type === "element" ? moveFileName(child) : child,
    ),
  })
}

function moveFileName(node: ElementContent): ElementContent {
  if (node.type !== "element") {
    return node
  }

  return {
    ...node,
    properties: node.tagName === "code" ? withFileName(node) : node.properties,
    children: node.children.map(moveFileName),
  }
}

function withFileName(node: Element): Properties {
  const meta = fenceMeta(node)
  if (meta === undefined) {
    return node.properties
  }
  const { rest, marks } = splitMarksToken(meta)
  return {
    ...node.properties,
    ...(rest === "" ? {} : { [CODE_FILE_NAME_PROPERTY]: rest }),
    ...(marks === undefined ? {} : { [CODE_MARKS_PROPERTY]: marks }),
  }
}

/** `data.meta` は hast の型が `string | null | undefined` を許すので、文字列のときだけ見る。 */
function fenceMeta(node: Element): string | undefined {
  const meta = node.data?.meta
  return typeof meta === "string" ? meta : undefined
}
