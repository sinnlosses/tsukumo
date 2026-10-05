import { describe, expect, it } from "vitest"

import { questionImagePaths } from "../../../../src/server/report/core/question-image-path.ts"
import type { Question } from "../../../../src/shared/session-driver/question.ts"

function questionWith(previews: readonly (string | undefined)[]): Question {
  return {
    header: "架空の選択",
    text: "架空の質問",
    multiSelect: false,
    options: previews.map((preview, index) => ({
      label: `架空の案${String(index)}`,
      description: "",
      preview,
    })),
  }
}

describe("questionImagePaths", () => {
  it("全選択肢の preview から、相対・絶対・表のセルの中の画像のパスを重複なしで拾う", () => {
    const questions = [
      questionWith(["![架空A](shot/a.png)\n\n![架空B](/tmp/架空/b.png)", undefined]),
      questionWith(["| 架空 |\n| --- |\n| ![架空A](shot/a.png) ![架空C](<架空 の/c.png>) |"]),
    ]

    expect(questionImagePaths(questions)).toEqual([
      "shot/a.png",
      "/tmp/架空/b.png",
      "架空 の/c.png",
    ])
  })

  it.each([
    "![架空の外部](https://example.invalid/a.png)",
    "![架空のプロトコル相対](//example.invalid/a.png)",
    "![架空の埋め込み](data:image/png;base64,AAAA)",
    '<img src="架空/a.png" alt="架空の HTML">',
    "```md\n![架空のフェンスの中](shot/a.png)\n```",
    "架空の字 `![架空のスパンの中](shot/a.png)` 架空の字",
    "\\![架空のエスケープ](shot/a.png)",
  ])("外部の URL・data:・HTML の img・コードとエスケープの中の記法は拾わない（%s）", (preview) => {
    expect(questionImagePaths([questionWith([preview])])).toEqual([])
  })
})
