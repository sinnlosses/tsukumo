import { describe, expect, it } from "bun:test"

import { commandCandidates, commandSuggestions } from "../../src/shared/command-suggestion.ts"
import { type CommandDescription, type SessionEvent } from "../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../src/shared/session-state.ts"

// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。
// 候補は時刻に依らないので、畳み込みは固定の 0 で流す。
function apply(...events: readonly SessionEvent[]): SessionState {
  return events.reduce((view, event) => applySessionEvent(view, event, 0), INITIAL_SESSION_STATE)
}

/** 姿から出どころの2つを渡す（呼び出し側 `<Composer>` がしているのと同じこと）。 */
function suggestionsOf(state: SessionState): readonly CommandDescription[] {
  return commandSuggestions(state.slashCommands, state.commandDescriptions)
}

describe("commandSuggestions", () => {
  const info: SessionEvent = {
    kind: "session-info",
    sessionId: "s-1",
    model: undefined,
    permissionMode: undefined,
    slashCommands: ["clear", "model", "doctor"],
    terminalSlashCommands: ["doctor"],
  }

  it("説明が届く前は名前だけ（description は undefined）を返す", () => {
    expect(suggestionsOf(apply(info))).toEqual([
      { name: "clear", description: undefined },
      { name: "model", description: undefined },
    ])
  })

  it("init 前（slashCommands が空）でも commandDescriptions が届いていれば名前の出どころにする", () => {
    const view = apply({
      kind: "command-descriptions",
      descriptions: [
        { name: "clear", description: "会話をリセットする" },
        { name: "model", description: undefined },
      ],
    })

    expect(view.slashCommands).toEqual([])
    expect(suggestionsOf(view)).toEqual([
      { name: "clear", description: "会話をリセットする" },
      { name: "model", description: undefined },
    ])
  })

  it("届いた説明を同じ名前の候補に添える（説明の無いものは undefined のまま）", () => {
    const view = apply(info, {
      kind: "command-descriptions",
      descriptions: [
        { name: "clear", description: "会話をリセットする" },
        { name: "model", description: undefined },
        { name: "doctor", description: "端末専用なので候補に出ない" },
      ],
    })

    expect(suggestionsOf(view)).toEqual([
      { name: "clear", description: "会話をリセットする" },
      { name: "model", description: undefined },
    ])
  })

  it("説明が先に届いても、あとから来た init の候補に添わる", () => {
    const view = apply(
      {
        kind: "command-descriptions",
        descriptions: [{ name: "clear", description: "会話をリセットする" }],
      },
      info,
    )

    expect(suggestionsOf(view)).toEqual([
      { name: "clear", description: "会話をリセットする" },
      { name: "model", description: undefined },
    ])
  })
})

describe("commandCandidates", () => {
  it("端末専用のコマンドを除いた残りを返す", () => {
    expect(commandCandidates(["clear", "model", "doctor"], ["doctor"])).toEqual(["clear", "model"])
  })

  it("端末専用が空のときはそのまま返す", () => {
    expect(commandCandidates(["clear", "model"], [])).toEqual(["clear", "model"])
  })

  it("元の並び順を保つ（並べ替えない）", () => {
    expect(commandCandidates(["b", "a", "c"], ["a"])).toEqual(["b", "c"])
  })
})
