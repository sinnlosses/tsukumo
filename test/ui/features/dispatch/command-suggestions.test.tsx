import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { type CommandDescription } from "../../../../src/protocol/session-event.ts"
import {
  CommandSuggestions,
  MAX_COMMAND_SUGGESTIONS,
  matchingCommands,
  shouldShowCommandSuggestions,
} from "../../../../src/ui/features/dispatch/command-suggestions.tsx"

afterEach(() => {
  cleanup()
})

function command(name: string): CommandDescription {
  return { name, description: undefined }
}

describe("shouldShowCommandSuggestions", () => {
  it("先頭が / で空白が無く、答え待ちも無いときだけ true", () => {
    expect(shouldShowCommandSuggestions("/clear", false)).toBe(true)
    expect(shouldShowCommandSuggestions("clear", false)).toBe(false)
    expect(shouldShowCommandSuggestions("/clear now", false)).toBe(false)
    expect(shouldShowCommandSuggestions("/clear", true)).toBe(false)
  })
})

describe("matchingCommands", () => {
  it("前方一致を先に、部分一致をあとに、各グループはアルファベット順で出す", () => {
    const commands = [command("compact"), command("clear"), command("bclear")]

    expect(matchingCommands(commands, "/cl").map((c) => c.name)).toEqual(["clear", "bclear"])
  })

  it(`合計最大 ${String(MAX_COMMAND_SUGGESTIONS)} 件に絞る`, () => {
    const commands = Array.from({ length: 15 }, (_, i) => command(`cmd${String(i)}`))

    expect(matchingCommands(commands, "/cmd")).toHaveLength(MAX_COMMAND_SUGGESTIONS)
  })

  it("前方一致・部分一致のどちらにも当たらない候補は出ない", () => {
    const commands = [command("clear"), command("doctor")]

    expect(matchingCommands(commands, "/xyz")).toEqual([])
  })
})

describe("CommandSuggestions", () => {
  it("matches が空のときは何も描かない", () => {
    const { container } = render(
      <CommandSuggestions matches={[]} selectedIndex={0} onSelect={() => {}} />,
    )

    expect(container.innerHTML).toBe("")
  })

  it("選ばれている候補に is-selected クラスが付き、説明があれば添える", () => {
    render(
      <CommandSuggestions
        matches={[
          { name: "clear", description: "架空の説明" },
          { name: "compact", description: undefined },
        ]}
        selectedIndex={1}
        onSelect={() => {}}
      />,
    )

    const items = screen.getAllByRole("listitem")
    expect(items[0]?.className).not.toContain("is-selected")
    expect(items[1]?.className).toContain("is-selected")
    expect(screen.getByText("架空の説明")).toBeDefined()
  })

  it("mousedown で押した候補の index を onSelect に渡す", () => {
    const calls: number[] = []
    render(
      <CommandSuggestions
        matches={[command("clear"), command("compact")]}
        selectedIndex={0}
        onSelect={(index) => calls.push(index)}
      />,
    )

    fireEvent.mouseDown(screen.getAllByRole("listitem")[1]!)

    expect(calls).toEqual([1])
  })
})
