import { describe, expect, it } from "vitest"

import { questionImagePaths } from "../../../../src/server/report/core/question-image-path.ts"
import type { QuestionBrief } from "../../../../src/shared/session-driver/question-brief.ts"
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

    expect(questionImagePaths({ questions, briefs: [] })).toEqual([
      "shot/a.png",
      "/tmp/架空/b.png",
      "架空 の/c.png",
    ])
  })

  it("添え書きの選択肢の図の image の塊のパスも、preview と重ねずに拾う", () => {
    const brief: QuestionBrief = {
      header: "架空の選択",
      background: "架空の背景。",
      axes: ["架空の軸"],
      options: [
        {
          label: "架空の案0",
          pros: ["架空の良い点。"],
          cons: [],
          byAxis: ["架空"],
          irreversible: false,
          figures: [
            { kind: "image", path: "shot/a.png", caption: "架空", notes: [], fold: "" },
            { kind: "image", path: "shot/d.png", caption: "架空", notes: [], fold: "" },
            { kind: "mermaid", title: "", source: "flowchart LR\n  A --> B", fold: "" },
          ],
        },
      ],
    }

    expect(
      questionImagePaths({ questions: [questionWith(["![架空A](shot/a.png)"])], briefs: [brief] }),
    ).toEqual(["shot/a.png", "shot/d.png"])
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
    expect(questionImagePaths({ questions: [questionWith([preview])], briefs: [] })).toEqual([])
  })
})
