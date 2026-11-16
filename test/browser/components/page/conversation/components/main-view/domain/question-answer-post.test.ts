import { describe, expect, it } from "vitest"

import {
  answerPostOf,
  redoDraftOf,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/question-answer-post.ts"
import type { MainViewQuestion } from "../../../../../../../../src/shared/session/main-view-shape.ts"

function asked(
  headers: readonly string[],
  answers: MainViewQuestion["answers"],
  multiSelect = false,
): MainViewQuestion {
  return {
    kind: "question",
    toolUseId: "toolu_fictional",
    questions: headers.map((header) => ({
      header,
      text: "どちらにする？",
      multiSelect,
      options: [
        { label: "案A", description: "", preview: undefined },
        { label: "案B", description: "", preview: undefined },
      ],
    })),
    answers,
    briefs: [],
    imageSizes: [],
    unshelvedImages: [],
  }
}

describe("answerPostOf", () => {
  it("選んだ答えは「答え」の札と選んだ案の名前", () => {
    expect(answerPostOf(asked(["確認"], [{ kind: "chosen", labels: ["案B"] }]))).toEqual({
      stamp: "答え",
      lines: ["案B"],
    })
  })

  it("書いた答え（選択肢に無い字）はその字をそのまま出す", () => {
    expect(answerPostOf(asked(["確認"], [{ kind: "chosen", labels: ["第三の案"] }]))).toEqual({
      stamp: "答え",
      lines: ["第三の案"],
    })
  })

  it("複数選択はラベルを「、」で連ねる", () => {
    expect(
      answerPostOf(asked(["確認"], [{ kind: "chosen", labels: ["案A", "案B"] }], true)),
    ).toEqual({ stamp: "答え", lines: ["案A、案B"] })
  })

  it("任せた答えは「任せた」の札と字", () => {
    expect(answerPostOf(asked(["確認"], [{ kind: "entrusted" }]))).toEqual({
      stamp: "任せた",
      lines: ["任せた"],
    })
  })

  it("2問は1問1行で「題: 答え」と並べる", () => {
    expect(
      answerPostOf(
        asked(
          ["方針", "名前"],
          [
            { kind: "chosen", labels: ["案A"] },
            { kind: "chosen", labels: ["案B"] },
          ],
        ),
      ),
    ).toEqual({ stamp: "答え", lines: ["方針: 案A", "名前: 案B"] })
  })

  it("2問のうち1問でも任せていれば札は「任せた」で、任せた問の行は「題: 任せた」", () => {
    expect(
      answerPostOf(
        asked(["方針", "名前"], [{ kind: "chosen", labels: ["案A"] }, { kind: "entrusted" }]),
      ),
    ).toEqual({ stamp: "任せた", lines: ["方針: 案A", "名前: 任せた"] })
  })
})

describe("redoDraftOf", () => {
  it("1問なら1行の訂正の補足の下書き", () => {
    expect(redoDraftOf(asked(["確認"], [{ kind: "chosen", labels: ["案A"] }]))).toBe(
      "（答え直し）確認: ",
    )
  })

  it("2問なら問ごとに1行を改行で連ねる", () => {
    expect(
      redoDraftOf(
        asked(
          ["方針", "名前"],
          [
            { kind: "chosen", labels: ["案A"] },
            { kind: "chosen", labels: ["案B"] },
          ],
        ),
      ),
    ).toBe("（答え直し）方針: \n（答え直し）名前: ")
  })
})
