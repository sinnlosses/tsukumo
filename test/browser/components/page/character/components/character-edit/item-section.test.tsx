import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CharacterEdit } from "../../../../../../../src/browser/components/page/character/components/character-edit/character-edit.tsx"
import { MAX_ITEMS, type ItemInfo } from "../../../../../../../src/shared/item/item.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../src/shared/session/session-state.ts"
import { characterInfo } from "../../../../../../fixture/character.ts"
import { createTestQueryClient } from "../../../../../query-client.tsx"
import { type CommandSpy, type SentCommand, putSession } from "../../../../../session-store.ts"

const FIXTURE_CHARACTER = characterInfo({})

const HAT: ItemInfo = { id: "item-1", name: "ぼうし", url: "/item/item-1.png?v=fictional@1" }
const CUP: ItemInfo = { id: "item-2", name: "コップ", url: "/item/item-2.png?v=fictional@1" }

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

function renderEdit(
  patch: Partial<SessionState>,
  spy: CommandSpy = () => {},
  character: SessionState["character"] = FIXTURE_CHARACTER,
): void {
  putSession({ ...INITIAL_SESSION_STATE, character, ...patch }, spy)
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CharacterEdit />
    </QueryClientProvider>,
  )
}

function seatSelect(label: string): HTMLSelectElement {
  const select = screen.getByLabelText(`${label}に置くアイテム`)
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error("席の選び口が select ではない")
  }
  return select
}

describe("アイテムの区画", () => {
  it("3つの席を並べ、置いているアイテムを選び口の値にする", () => {
    renderEdit({
      items: [HAT, CUP],
      itemSeats: {
        [FIXTURE_CHARACTER.pack]: { topLeft: HAT, belowLeft: undefined, belowRight: undefined },
      },
    })

    expect(seatSelect("左上").value).toBe(HAT.id)
    expect(seatSelect("キャラの左下").value).toBe("")
    expect(seatSelect("キャラの右下").value).toBe("")
    expect(screen.getAllByRole("option", { name: "置かない" })).toHaveLength(3)
  })

  it("席にアイテムを選ぶと、選んでいるパックの席として送る", () => {
    const sent: SentCommand[] = []
    renderEdit({ items: [HAT, CUP] }, (command) => sent.push(command))

    fireEvent.change(seatSelect("キャラの左下"), { target: { value: CUP.id } })

    expect(sent).toEqual([
      { procedure: "item.setSeat", pack: FIXTURE_CHARACTER.pack, seat: "belowLeft", id: CUP.id },
    ])
  })

  it("「置かない」を選ぶと席を空にする", () => {
    const sent: SentCommand[] = []
    renderEdit(
      {
        items: [HAT],
        itemSeats: {
          [FIXTURE_CHARACTER.pack]: { topLeft: HAT, belowLeft: undefined, belowRight: undefined },
        },
      },
      (command) => sent.push(command),
    )

    fireEvent.change(seatSelect("左上"), { target: { value: "" } })

    expect(sent).toEqual([
      { procedure: "item.clearSeat", pack: FIXTURE_CHARACTER.pack, seat: "topLeft" },
    ])
  })

  it("画面から変えられないパックでも席は選べる", () => {
    const sent: SentCommand[] = []
    renderEdit({ items: [HAT] }, (command) => sent.push(command), {
      ...FIXTURE_CHARACTER,
      editable: false,
    })

    fireEvent.change(seatSelect("左上"), { target: { value: HAT.id } })

    expect(sent).toHaveLength(1)
  })

  it("消す前の確かめは、全パックで空になる席の数を言い、消すを押すまで送らない", () => {
    const sent: SentCommand[] = []
    renderEdit(
      {
        items: [HAT, CUP],
        itemSeats: {
          [FIXTURE_CHARACTER.pack]: { topLeft: HAT, belowLeft: undefined, belowRight: undefined },
          "fictional-other": { topLeft: undefined, belowLeft: HAT, belowRight: CUP },
        },
      },
      (command) => sent.push(command),
    )

    fireEvent.click(screen.getByRole("button", { name: "ぼうしを消す" }))

    expect(screen.getByText("置いている 2 つの席が空になります。")).toBeDefined()
    expect(sent).toEqual([])

    fireEvent.click(screen.getByRole("button", { name: "消す" }))

    expect(sent).toEqual([{ procedure: "item.remove", id: HAT.id }])
  })

  it("消す前の確かめで「やめる」を押すと何も送らず閉じる", () => {
    const sent: SentCommand[] = []
    renderEdit({ items: [HAT] }, (command) => sent.push(command))

    fireEvent.click(screen.getByRole("button", { name: "ぼうしを消す" }))
    fireEvent.click(screen.getByRole("button", { name: "やめる" }))

    expect(sent).toEqual([])
    expect(screen.queryByText("どのキャラクターの席にも置いていません。")).toBeNull()
  })

  it("上限まで入っているときは足す口を塞ぎ、理由を title に出す", () => {
    const full = Array.from({ length: MAX_ITEMS }, (_, index) => ({
      id: `item-${String(index + 1)}`,
      name: `品${String(index + 1)}`,
      url: `/item/item-${String(index + 1)}.png?v=fictional@1`,
    }))
    renderEdit({ items: full })

    const add = screen.getByRole("button", { name: "アイテムを足す" })
    expect(add.getAttribute("aria-disabled")).toBe("true")
    expect(add.getAttribute("title")).toContain(String(MAX_ITEMS))
  })

  it("足すダイアログは名前と画像がそろうまで「足す」を押せず、断られたら開いたまま一言を出す", async () => {
    const sent: SentCommand[] = []
    renderEdit({ items: [] }, (command) => {
      sent.push(command)
      return Promise.reject(new Error("refused"))
    })

    fireEvent.click(screen.getByRole("button", { name: "アイテムを足す" }))
    const submit = screen.getByRole("button", { name: "足す" })
    expect(submit.getAttribute("aria-disabled")).toBe("true")

    fireEvent.change(screen.getByLabelText("名前"), { target: { value: "ぼうし" } })
    fireEvent.change(screen.getByLabelText("画像"), {
      target: { files: [new File(["x"], "hat.png", { type: "image/png" })] },
    })
    expect(submit.getAttribute("aria-disabled")).toBe("false")
    fireEvent.click(submit)

    await waitFor(() => {
      expect(screen.getByText(/足せなかった/)).toBeDefined()
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.procedure).toBe("item.add")
    expect(sent[0]?.name).toBe("ぼうし")
  })
})
