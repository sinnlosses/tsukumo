// 組み立てた CSS からブロックコメントを落とす。
// 文字列や `url()` の中の `/*` を壊さないよう、正規表現でなく postcss で読んで `comment` ノードを消す。

import { readFile, writeFile } from "node:fs/promises"

import postcss from "postcss"

export async function stripCssCommentInFile(path: string): Promise<void> {
  await writeFile(path, stripCssComment(await readFile(path, "utf8")))
}

function stripCssComment(css: string): string {
  const root = postcss.parse(css)
  root.walkComments((comment) => {
    comment.remove()
  })
  return root.toString()
}
