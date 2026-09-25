import { describe, expect, it } from "bun:test"

import {
  createSessionTitleIntake,
  decideSessionTitle,
  INITIAL_SESSION_TITLE_STATE,
  type SessionTitleState,
} from "../../../../src/server/session-driver/core/session-title.ts"
import { MAX_SESSION_HEADING_LENGTH } from "../../../../src/shared/session-choice.ts"

// 題はすべて手で書いた架空の文字列（docs/coding-standards.md「会話内容の扱い」）。

describe("decideSessionTitle", () => {
  it("現在値が無ければ書く", () => {
    const action = decideSessionTitle(INITIAL_SESSION_TITLE_STATE, "架空の題", undefined)

    expect(action).toEqual({ kind: "write", title: "架空の題" })
  })

  it("現在値が tsukumo が最後に書いたものと同じなら、新しい候補で書き直す", () => {
    const state: SessionTitleState = { lastWritten: "架空の前の題" }

    const action = decideSessionTitle(state, "架空の新しい題", "架空の前の題")

    expect(action).toEqual({ kind: "write", title: "架空の新しい題" })
  })

  it("候補が現在値と同じなら書かない（変わらないので無駄打ちしない）", () => {
    const state: SessionTitleState = { lastWritten: "架空の題" }

    const action = decideSessionTitle(state, "架空の題", "架空の題")

    expect(action).toEqual({ kind: "skip" })
  })

  it("現在値が「無い」でも「tsukumo が最後に書いたもの」でもなければ、上書きしない（/rename 由来とみなす）", () => {
    const action = decideSessionTitle(
      INITIAL_SESSION_TITLE_STATE,
      "架空の新しい題",
      "利用者が付けた架空の題",
    )

    expect(action).toEqual({ kind: "skip" })
  })

  it("tsukumo が最後に書いた題と現在値が食い違っていれば、以後も上書きしない", () => {
    const state: SessionTitleState = { lastWritten: "架空の前の題" }

    const action = decideSessionTitle(state, "架空の新しい題", "利用者が書き換えた架空の題")

    expect(action).toEqual({ kind: "skip" })
  })

  it(`${String(MAX_SESSION_HEADING_LENGTH)}字を超える候補は切り詰めてから書く`, () => {
    const long = "あ".repeat(MAX_SESSION_HEADING_LENGTH + 5)

    const action = decideSessionTitle(INITIAL_SESSION_TITLE_STATE, long, undefined)

    expect(action).toEqual({ kind: "write", title: "あ".repeat(MAX_SESSION_HEADING_LENGTH) })
  })

  it("切り詰めた結果が現在値と同じなら書かない", () => {
    const long = "あ".repeat(MAX_SESSION_HEADING_LENGTH + 5)
    const truncated = "あ".repeat(MAX_SESSION_HEADING_LENGTH)

    const action = decideSessionTitle(INITIAL_SESSION_TITLE_STATE, long, truncated)

    expect(action).toEqual({ kind: "skip" })
  })
})

describe("createSessionTitleIntake", () => {
  it("まだ何も受け取っていなければ undefined", () => {
    const intake = createSessionTitleIntake()

    expect(intake.take()).toBeUndefined()
  })

  it("受け取った題を1回だけ返し、取り出したら空に戻る", () => {
    const intake = createSessionTitleIntake()

    intake.note("架空の題")

    expect(intake.take()).toBe("架空の題")
    expect(intake.take()).toBeUndefined()
  })

  it("同じターンで2回渡されたら、後のほうを覚える", () => {
    const intake = createSessionTitleIntake()

    intake.note("架空の前の題")
    intake.note("架空の後の題")

    expect(intake.take()).toBe("架空の後の題")
  })

  it("空白だけの題は無いものとして扱う", () => {
    const intake = createSessionTitleIntake()

    intake.note("架空の題")
    intake.note("   ")

    expect(intake.take()).toBe("架空の題")
  })

  it("前後の空白を落とす", () => {
    const intake = createSessionTitleIntake()

    intake.note("  架空の題  ")

    expect(intake.take()).toBe("架空の題")
  })
})
