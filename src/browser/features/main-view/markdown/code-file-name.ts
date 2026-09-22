// フェンスの info 文字列に書いたファイル名（```diff src/foo.ts の `src/foo.ts`）を、hast の
// `code` 要素の属性へ移す rehype のプラグイン。**rehype-raw より前に差す**（`markdown.tsx` の
// `rehypePlugins` の並び）。
//
// **なぜ移すのか**: mdast-util-to-hast が `className`（`language-diff`）にするのは info 文字列の
// 先頭の語だけで、残りは要素の `data.meta` に置く。`data` は属性ではないので、**hast-util-raw
// （rehype-raw）が木を HTML へ書き出して読み直す時点で落ちる**（実測。この経路を通ると
// `data` ごと消える）。属性にしておけば書き出し・読み直しを越え、サニタイザ
// （`sanitize-schema.ts` の `code` の許可）を通って `markdown.tsx` の `Pre` まで届く。
//
// **中身は解釈せず、前後の空白を落としてそのまま運ぶ**（`src/server/core/report-notation.ts` の
// 規約が「パスを1つ」と決めていて、それ以外が来たときも読み手に見せたほうが手掛かりになる）。

import { type Element, type ElementContent, type Properties, type Root } from "hast"

/**
 * ファイル名を運ぶ hast のプロパティ名（DOM に出るときの属性名は `data-filename`）。
 * **`sanitize-schema.ts` の許可リストと `markdown.tsx` の `Pre` が同じ名前で受ける**ので、
 * 綴りを1箇所に置く。
 */
export const CODE_FILE_NAME_PROPERTY = "dataFilename"

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
  const fileName = fenceFileName(node)
  if (fileName === undefined) {
    return node.properties
  }
  return { ...node.properties, [CODE_FILE_NAME_PROPERTY]: fileName }
}

/** `data.meta` は hast の型が `string | null | undefined` を許すので、文字列のときだけ見る。 */
function fenceFileName(node: Element): string | undefined {
  const meta = node.data?.meta
  if (typeof meta !== "string") {
    return undefined
  }
  const trimmed = meta.trim()
  return trimmed === "" ? undefined : trimmed
}
