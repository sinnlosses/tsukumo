// 質問の選択肢の `preview` の Markdown の画像を、その質問の棚を引く経路に替える remark のプラグイン。
// 替えるのは mdast の `image` の節点だけなので、コードフェンス・コードスパン・エスケープの中の記法は字のまま残る。
// 替えなかった行き先（外部の URL・`data:`）と生の `<img>` の `src` は、許可リスト（`REPORT_SANITIZE_SCHEMA`）が落とす。
//
// remark プラグインの規約として、渡された木はその場で書き換える（呼び出し側へ複製を返さない）。

import type { Nodes } from "mdast"
import { visit } from "unist-util-visit"

import {
  isShelvedImageUrl,
  reportImagePath,
} from "../../../../../../../shared/report/report-image.ts"

export function remarkPreviewImage(toolUseId: string): () => (tree: Nodes) => void {
  return () => (tree) => {
    visit(tree, "image", (node) => {
      if (isShelvedImageUrl(node.url)) {
        node.url = reportImagePath(toolUseId, node.url)
      }
    })
  }
}
