import { describe, expect, it } from "vitest"

import type { ReportBlock } from "../../../src/shared/report/report-block.ts"
import { reportImagePath } from "../../../src/shared/report/report-image.ts"
import { reportSectionsMarkdown } from "../../../src/shared/report/report-markdown.ts"
import { figureCaptioned, markdownOf, section } from "../../fixture/report-markdown.ts"

describe("reportSectionsMarkdown", () => {
  it("image は棚を引く src の img と1行の説明を組み、説明の < は逃がす。頭に図の通し番号が付く", () => {
    const image: ReportBlock = {
      kind: "image",
      path: "架空/after.png",
      caption: "架空の<画面>",
      notes: [],
      fold: "",
      aside: "",
    }

    expect(
      reportSectionsMarkdown([section([image])], { kind: "shelved", toolUseId: "toolu_fictional" }),
    ).toBe(
      figureCaptioned(
        `<img src="${reportImagePath("toolu_fictional", "架空/after.png")}" alt="架空の&lt;画面&gt;">`,
        "架空の&lt;画面&gt;",
      ),
    )
  })

  it("image の説明が空なら alt は既定の語で説明の文字は置かず、図の番号だけ付く。棚に置いていない本文では src を付けない", () => {
    expect(
      markdownOf({ kind: "image", path: "架空.png", caption: " ", notes: [], fold: "", aside: "" }),
    ).toBe(figureCaptioned('<img alt="画面の画像">'))
  })

  it("image の notes は画像の横に1から番号を振った並びになり、< は逃がし、包みは縮めない", () => {
    const image: ReportBlock = {
      kind: "image",
      path: "架空.png",
      caption: "架空の画面",
      notes: ["左上の <帯> が伸びた", "右の `札` が消えた"],
      fold: "",
      aside: "",
    }

    expect(markdownOf(image)).toBe(
      figureCaptioned(
        '<div class="image-notes"><img alt="架空の画面"><ol class="image-note-list">' +
          '<li><span class="image-note-number" aria-hidden="true">1</span><span class="image-note-text">左上の &lt;帯&gt; が伸びた</span></li>' +
          '<li><span class="image-note-number" aria-hidden="true">2</span><span class="image-note-text">右の <code>札</code> が消えた</span></li>' +
          "</ol></div>",
        "架空の画面",
        1,
        false,
      ),
    )
  })
})
