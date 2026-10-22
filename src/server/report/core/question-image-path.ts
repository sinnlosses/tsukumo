// 質問の選択肢の `preview` が Markdown の画像で指す手元のパスを構文木から拾い、添え書きの `image` の塊のパスと合わせる。
//
// 拾うのは mdast の `image` の節点だけなので、コードフェンス・コードスパン・エスケープの中の記法と生の `<img>` は拾わない。

import { visit } from "unist-util-visit"

import { isShelvedImageUrl } from "../../../shared/report/report-image.ts"
import type { PendingAsk } from "../../../shared/session-driver/pending-ask.ts"
import { markdownTreeOf } from "./markdown-tree.ts"

/** 質問の全選択肢の `preview` と添え書きの `image` の塊が指す、棚に置く画像のパス（重複なし）。 */
export function questionImagePaths(
  ask: Pick<QuestionPendingAsk, "questions" | "briefs">,
): readonly string[] {
  return [
    ...new Set([
      ...ask.questions
        .flatMap((question) => question.options)
        .flatMap((option) =>
          option.preview === undefined ? [] : previewImagePaths(option.preview),
        ),
      ...ask.briefs
        .flatMap((brief) => brief.options)
        .flatMap((option) => option.figures)
        .flatMap((figure) => (figure.kind === "image" && figure.path !== "" ? [figure.path] : [])),
    ]),
  ]
}

type QuestionPendingAsk = Extract<PendingAsk, { readonly kind: "question" }>

function previewImagePaths(preview: string): readonly string[] {
  const urls: string[] = []
  visit(markdownTreeOf(preview), "image", (node) => {
    if (isShelvedImageUrl(node.url)) {
      urls.push(node.url)
    }
  })
  return urls
}
