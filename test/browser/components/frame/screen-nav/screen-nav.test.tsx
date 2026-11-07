import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/frame/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import { FRAME_ERROR_REASON } from "../../../../../src/shared/frame-error-reason.ts"
import type { StampedPendingAsk } from "../../../../../src/shared/session-driver/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { setPageUrl } from "../../../../dom-setup.ts"
import { characterInfo, characterPackEntry } from "../../../../fixture/character.ts"
import { typedElement } from "../../../../typed-element.ts"
import { MARKED_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
import { stubPhoneWidth } from "../../../phone-width.ts"
import { queryClientWrapper } from "../../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../../rpc-fetch-stub.ts"
import { type CommandSpy, putSession, type SentCommand } from "../../../session-store.ts"

const FIXTURE_PENDING: StampedPendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
  askedAt: 0,
}

// 部屋の名前はこのページを配っているポートから決まる（`roomName`）ので、
// ポートを見るテストは URL ごと差し替える。既定へ戻すのは afterEach。
const DEFAULT_PAGE_URL = "http://127.0.0.1/"

beforeEach(() => {
  stubPhoneWidth(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  setPageUrl(DEFAULT_PAGE_URL)
  window.location.hash = ""
})

function renderScreenNav(state: Partial<SessionState> = {}, spy: CommandSpy = () => {}): void {
  putSession({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(<ScreenNav drawer={MARKED_NAV_DRAWER_SLOTS} />, { wrapper: queryClientWrapper() })
}

/** 狭い画面の頭の右上の ≡。 */
function drawerToggle(): HTMLElement {
  return screen.getByRole("button", { name: "やり取りとタスクを開く" })
}

function openedDrawer(): HTMLElement {
  return screen.getByRole("dialog", { name: "引き出し" })
}

/** Esc を押したときと同じく、開いている `<dialog>` を閉じる（`close` が届く）。 */
function closeDrawerDialog(): void {
  const dialog = openedDrawer()
  act(() => {
    if (dialog instanceof window.HTMLDialogElement) {
      dialog.close()
    }
  })
}

describe("ScreenNav", () => {
  // いまの画面の口には地と字の濃さを変える class が付く（docs/architecture/screen-design.md「画面のナビゲーション」）。
  it("いま出している画面の口に is-active が付く", () => {
    window.location.hash = "#token-usage"
    renderScreenNav()

    expect(screen.getByRole("link", { name: "トークン" }).className).toContain("is-active")
    expect(screen.getByRole("link", { name: /^仕事/ }).className).not.toContain("is-active")
    expect(screen.getByRole("link", { name: "トークン" }).getAttribute("aria-current")).toBe("page")
  })

  // 部屋の名前は帯の左端（docs/architecture/screen-design.md「画面のナビゲーション」）。ポートの並び順に割り当たる（`roomName`）ので、
  // 出ている名前でどの tsukumo を見ているかが分かる。
  it("帯の左端に、このページのポートの部屋の名前を出す", () => {
    setPageUrl("http://127.0.0.1:7329/")
    renderScreenNav()

    expect(document.querySelector(".screen-nav-identity .screen-nav-room")?.textContent).toBe(
      "菜の花の間",
    )
  })

  describe("プロジェクト名", () => {
    let stub: RpcFetchStub | undefined = undefined
    afterEach(() => {
      stub?.restore()
      stub = undefined
    })

    it("届くと主の字に出て、部屋の名前は補足に下がり、title で両方読める", async () => {
      setPageUrl("http://127.0.0.1:7329/")
      stub = stubRpcFetch(() => rpcOutput("fictional-project"))
      renderScreenNav()

      const title = await screen.findByTitle("fictional-project · 菜の花の間")
      expect(title.querySelector(".screen-nav-project")?.textContent).toBe("fictional-project")
      expect(title.querySelector(".screen-nav-room-note")?.textContent).toBe("菜の花の間")
    })

    it("届く前と、空で届いたときは、部屋の名前が主の字のまま", async () => {
      setPageUrl("http://127.0.0.1:7329/")
      stub = stubRpcFetch(() => rpcOutput(""))
      renderScreenNav()

      await waitFor(() => expect(stub?.calls()).toHaveLength(1))
      expect(document.querySelector(".screen-nav-identity .screen-nav-room")?.textContent).toBe(
        "菜の花の間",
      )
      expect(document.querySelector(".screen-nav-project")).toBeNull()
    })
  })

  // 顔は帯の左端、部屋の名前の左（13.9「顔」）。
  describe("顔", () => {
    it("face が無いパックでは何も出さない（mini や立ち絵からは補わない）", () => {
      renderScreenNav({ character: characterInfo({ face: undefined }) })

      expect(document.querySelector(".screen-nav-identity .screen-nav-face")).toBeNull()
    })

    it("character が届く前（undefined）も何も出さない", () => {
      renderScreenNav()

      expect(document.querySelector(".screen-nav-identity .screen-nav-face")).toBeNull()
    })
  })

  // 顔の右下の「⌄」で開く（13.9「キャラクターの選択メニュー」）。
  describe("キャラクターの選択メニュー", () => {
    const PACKS = [
      characterPackEntry("fictional", "架空の精霊"),
      characterPackEntry("local", "架空の同居人"),
    ]

    it("顔を押すと選択メニューが開き、ほかのキャラクターを選ぶと switchCharacter を送って閉じる", () => {
      const sent: SentCommand[] = []
      renderScreenNav(
        {
          character: characterInfo({ name: "架空の精霊" }),
          characterPacks: PACKS.map((pack) => ({ ...pack, inUse: pack.name === "fictional" })),
        },
        (command) => sent.push(command),
      )
      const [face] = screen.getAllByRole("button", {
        name: "キャラクターを選ぶ（いまは 架空の精霊）",
      })
      if (face === undefined) {
        throw new Error("顔の口が無い")
      }

      fireEvent.click(face)
      expect(face.getAttribute("aria-expanded")).toBe("true")
      fireEvent.click(screen.getByRole("button", { name: "架空の同居人" }))

      expect(sent).toEqual([{ procedure: "session.switchCharacter", name: "local" }])
      expect(face.getAttribute("aria-expanded")).toBe("false")
    })

    it("いまのキャラクターを選び直しても送らず、ターン中はほかのキャラクターを押せない", () => {
      const sent: SentCommand[] = []
      renderScreenNav(
        {
          character: characterInfo({ name: "架空の精霊" }),
          characterPacks: PACKS.map((pack) => ({ ...pack, inUse: pack.name === "fictional" })),
          turn: { kind: "running", startedAt: 0 },
        },
        (command) => sent.push(command),
      )
      const [face] = screen.getAllByRole("button", { name: /キャラクターを選ぶ/u })
      if (face === undefined) {
        throw new Error("顔の口が無い")
      }
      fireEvent.click(face)

      expect(screen.getByRole("button", { name: "架空の同居人" }).hasAttribute("disabled")).toBe(
        true,
      )
      fireEvent.click(screen.getByRole("button", { name: /^架空の精霊/u }))
      expect(sent).toEqual([])
    })
  })

  // 狭い画面の ≡ と引き出し（広い画面では CSS が消す。ここでは DOM の有無だけを見る）。
  describe("引き出し", () => {
    it("≡ を押すと、名乗りの行・動き方の段・3つのタブ・下端の2つのボタンがこの順に出る", () => {
      setPageUrl("http://127.0.0.1:7328/")
      renderScreenNav({
        character: characterInfo({ name: "架空の精霊", face: "/character/face.png" }),
      })
      const toggle = drawerToggle()
      expect(screen.queryByRole("dialog", { name: "引き出し" })).toBeNull()

      fireEvent.click(toggle)

      const drawer = openedDrawer()
      expect(toggle.getAttribute("aria-expanded")).toBe("true")
      expect(drawer.querySelector(".screen-nav-face")?.getAttribute("src")).toBe(
        "/character/face.png",
      )
      expect(drawer.querySelector(".screen-nav-session-tag-drawer-room")?.textContent).toBe(
        "若葉の間",
      )
      expect(within(drawer).getByRole("link", { name: "仕事" })).toBeDefined()
      expect(within(drawer).getByRole("link", { name: "雑談" })).toBeDefined()
      expect(drawer.querySelector('[data-slot="runSetting"]')).not.toBeNull()
      expect(
        within(drawer)
          .getAllByRole("tab")
          .map((tab) => tab.textContent),
      ).toEqual(["やり取り", "タスク", "使用量"])
      const order = [
        typedElement(drawer.querySelector(".nav-drawer-identity"), HTMLElement, "名乗りの行"),
        typedElement(drawer.querySelector(".nav-drawer-run-setting"), HTMLElement, "動き方の段"),
        within(drawer).getByRole("tablist"),
        within(drawer).getByRole("tabpanel"),
        within(drawer).getByRole("button", { name: "＋ 新しいやり取り" }),
        within(drawer).getByRole("button", { name: "設定" }),
      ]
      const all = [...drawer.querySelectorAll("*")]
      const positions = order.map((node) => all.indexOf(node))
      expect(positions).toEqual(positions.toSorted((a, b) => a - b))
    })

    it("タブを押すとその差し込み口の中身に入れ替わり、閉じて開き直しても選んだタブのまま", () => {
      renderScreenNav()
      fireEvent.click(drawerToggle())
      expect(openedDrawer().querySelector('[data-slot="turns"]')).not.toBeNull()

      fireEvent.click(within(openedDrawer()).getByRole("tab", { name: "使用量" }))
      expect(openedDrawer().querySelector('[data-slot="usage"]')).not.toBeNull()
      expect(openedDrawer().querySelector('[data-slot="turns"]')).toBeNull()
      expect(
        within(openedDrawer()).getByRole("tab", { name: "使用量" }).getAttribute("aria-selected"),
      ).toBe("true")

      closeDrawerDialog()
      fireEvent.click(drawerToggle())

      expect(openedDrawer().querySelector('[data-slot="usage"]')).not.toBeNull()
    })

    it("雑談中は「タスク」のタブの字が「話題」になる", () => {
      renderScreenNav({ chatMode: true })
      fireEvent.click(drawerToggle())

      expect(
        within(openedDrawer())
          .getAllByRole("tab")
          .map((tab) => tab.textContent),
      ).toEqual(["やり取り", "話題", "使用量"])
    })

    it("「＋ 新しいやり取り」で startNewSession を1回送って閉じる", () => {
      const sent: SentCommand[] = []
      renderScreenNav({}, (command) => sent.push(command))
      fireEvent.click(drawerToggle())

      fireEvent.click(within(openedDrawer()).getByRole("button", { name: "＋ 新しいやり取り" }))

      expect(sent).toEqual([{ procedure: "session.startNewSession" }])
      expect(screen.queryByRole("dialog", { name: "引き出し" })).toBeNull()
    })

    it("ターン進行中は「＋ 新しいやり取り」が押せず、理由を title に出し、押しても何も送らない", () => {
      const sent: SentCommand[] = []
      renderScreenNav({ turn: { kind: "running", startedAt: 0 } }, (command) => sent.push(command))
      fireEvent.click(drawerToggle())
      const newSession = within(openedDrawer()).getByRole("button", { name: "＋ 新しいやり取り" })

      expect(newSession.getAttribute("aria-disabled")).toBe("true")
      expect(newSession.getAttribute("title")).toBe(FRAME_ERROR_REASON.sessionSwitchDuringTurn)
      fireEvent.click(newSession)

      expect(sent).toEqual([])
      expect(screen.getByRole("dialog", { name: "引き出し" })).toBeDefined()
    })

    // 覆いを押したときも Esc のときも、`<dialog>` の `close` が届いて閉じる。
    it("覆いを押すと閉じ、≡ へフォーカスが戻る", () => {
      renderScreenNav()
      const toggle = drawerToggle()
      fireEvent.click(toggle)

      fireEvent.click(openedDrawer())

      expect(screen.queryByRole("dialog", { name: "引き出し" })).toBeNull()
      expect(toggle.getAttribute("aria-expanded")).toBe("false")
      expect(document.activeElement).toBe(toggle)
    })

    // Esc で `<dialog>` を閉じるのはブラウザなので、ここでは閉じたあとに届く `close` から先を見る（Esc そのものは E2E）。
    it("`<dialog>` が閉じると（Esc）引き出しが閉じ、≡ へフォーカスが戻る", () => {
      renderScreenNav()
      const toggle = drawerToggle()
      fireEvent.click(toggle)

      closeDrawerDialog()

      expect(screen.queryByRole("dialog", { name: "引き出し" })).toBeNull()
      expect(document.activeElement).toBe(toggle)
    })

    it("引き出しの中でキャラクターの選択メニューを開いたまま覆いで閉じても、開き直すと閉じている", () => {
      renderScreenNav()
      fireEvent.click(drawerToggle())
      const face = typedElement(
        openedDrawer().querySelector(".screen-nav-character-picker-toggle"),
        HTMLElement,
        "引き出しの顔",
      )
      fireEvent.click(face)
      expect(openedDrawer().querySelector(".screen-nav-character-picker-panel")).not.toBeNull()

      fireEvent.click(openedDrawer())
      fireEvent.click(drawerToggle())

      expect(openedDrawer().querySelector(".screen-nav-character-picker-panel")).toBeNull()
    })

    it("歯車を押すと設定の面に入れ替わり、先頭にキャラ・トークン・成果の口がこの順で出る（会話の口は無い）", () => {
      renderScreenNav()
      fireEvent.click(drawerToggle())

      fireEvent.click(within(openedDrawer()).getByRole("button", { name: "設定" }))

      const face = within(openedDrawer()).getByRole("region", { name: "設定" })
      expect(within(openedDrawer()).queryByRole("tablist")).toBeNull()
      expect(
        within(within(face).getByRole("navigation", { name: "ほかの画面" }))
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(["キャラ›", "トークン›", "成果›"])
      expect(within(face).getByText("見た目")).toBeDefined()
      expect(
        within(openedDrawer()).getByRole("button", { name: "＋ 新しいやり取り" }),
      ).toBeDefined()
    })

    it("設定の面の口を押すと引き出しを閉じる", () => {
      renderScreenNav()
      fireEvent.click(drawerToggle())
      fireEvent.click(within(openedDrawer()).getByRole("button", { name: "設定" }))

      fireEvent.click(within(openedDrawer()).getByRole("link", { name: /^トークン/u }))

      expect(screen.queryByRole("dialog", { name: "引き出し" })).toBeNull()
    })

    it("「‹ 戻る」でタブの面へ戻り、フォーカスは歯車へ戻る。閉じて開き直すとタブの面から始まる", () => {
      renderScreenNav()
      fireEvent.click(drawerToggle())
      fireEvent.click(within(openedDrawer()).getByRole("button", { name: "設定" }))

      fireEvent.click(within(openedDrawer()).getByRole("button", { name: "‹ 戻る" }))

      expect(within(openedDrawer()).getByRole("tablist")).toBeDefined()
      expect(document.activeElement).toBe(
        within(openedDrawer()).getByRole("button", { name: "設定" }),
      )

      fireEvent.click(within(openedDrawer()).getByRole("button", { name: "設定" }))
      closeDrawerDialog()
      fireEvent.click(drawerToggle())
      expect(within(openedDrawer()).getByRole("tablist")).toBeDefined()
    })

    it("答え待ちの間も ≡ の名前は変わらない", () => {
      renderScreenNav({ pending: [FIXTURE_PENDING] })

      expect(drawerToggle()).toBeDefined()
    })
  })

  describe("仕事・雑談の門", () => {
    function gate(name: string): HTMLElement {
      return screen.getByRole("link", { name: new RegExp(`^${name}`) })
    }

    // 帯の操作子が送るコマンドは、いままでサイドバーの <select> が送っていたものと同じ
    // （`session.setChatMode`。docs/architecture/screen-design.md「画面のナビゲーション」）。
    it("違うモードの門を押すと session.setChatMode を送る", () => {
      const calls: unknown[] = []
      renderScreenNav({ chatMode: false }, (command) => {
        calls.push(command)
      })

      fireEvent.click(gate("雑談"))

      expect(calls).toEqual([{ procedure: "session.setChatMode", chat: true }])
    })

    it("同じモードの門を押しても何も送らない", () => {
      const calls: unknown[] = []
      renderScreenNav({ chatMode: false }, (command) => {
        calls.push(command)
      })

      fireEvent.click(gate("仕事"))

      expect(calls).toEqual([])
    })

    it("いまの印はサーバから届いたモードの門にだけ付き、押した側へ先には倒れない", () => {
      renderScreenNav({ chatMode: false })

      fireEvent.click(gate("雑談"))

      expect(gate("仕事").getAttribute("aria-current")).toBe("page")
      expect(gate("雑談").getAttribute("aria-current")).toBeNull()
    })

    it("ターン進行中は違うモードの門が aria-disabled になり、title に理由が出て、押しても送らない", () => {
      const calls: unknown[] = []
      renderScreenNav({ chatMode: false, turn: { kind: "running", startedAt: 0 } }, (command) => {
        calls.push(command)
      })

      const chatGate = gate("雑談")
      expect(chatGate.getAttribute("aria-disabled")).toBe("true")
      expect(chatGate.getAttribute("title")).toBe(FRAME_ERROR_REASON.chatModeSwitchDuringTurn)
      expect(gate("仕事").getAttribute("aria-disabled")).toBeNull()
      fireEvent.click(chatGate)

      expect(calls).toEqual([])
    })

    it("会話以外の画面にいるあいだは、戻り先のモードの門にだけ印が付く", () => {
      window.location.hash = "#character"
      renderScreenNav({ chatMode: true })

      expect(gate("雑談").className).toContain("has-return-mark")
      expect(gate("仕事").className).not.toContain("has-return-mark")
      expect(gate("キャラ").getAttribute("aria-current")).toBe("page")
      expect(gate("雑談").getAttribute("aria-current")).toBeNull()
    })

    it.each([
      ["依頼待ち", "idle", {}],
      ["作業中", "working", { turn: { kind: "running", startedAt: 0 } }],
      ["答え待ち", "pending", { pending: [FIXTURE_PENDING] }],
      ["止まっている", "stopped", { endedReason: "架空の終了理由" }],
    ] as const satisfies readonly (readonly [string, string, Partial<SessionState>])[])(
      "戻り先の門の名前とツールチップに状態の語（%s）が入り、点の色の種類が %s になる",
      (word, tone, state) => {
        window.location.hash = "#character"
        renderScreenNav({ chatMode: false, ...state })

        const returnGate = screen.getByRole("link", { name: `仕事（${word}）` })
        expect(returnGate.getAttribute("title")).toBe(`仕事（${word}）`)
        expect(returnGate.getAttribute("data-return-tone")).toBe(tone)
      },
    )

    it("会話以外の画面では、戻り先でない門に状態の語も点の色も付かない", () => {
      window.location.hash = "#character"
      renderScreenNav({ chatMode: false })

      const other = screen.getByRole("link", { name: "雑談" })
      expect(other.getAttribute("data-return-tone")).toBeNull()
      expect(other.getAttribute("title")).toBeNull()
    })

    it("会話の画面では戻り先の印を付けず、モードの門がいまの印を持つ", () => {
      renderScreenNav({ chatMode: true })

      expect(gate("雑談").className).not.toContain("has-return-mark")
      expect(gate("雑談").getAttribute("aria-current")).toBe("page")
    })
  })

  it("会話以外の画面の帯に、いまの作業の札もモデル・effort・許可モードの操作子も出ない", () => {
    window.location.hash = "#character"
    renderScreenNav()

    expect(screen.queryByLabelText("モデル")).toBeNull()
    expect(screen.queryByLabelText("effort")).toBeNull()
    expect(screen.queryByLabelText("許可モード")).toBeNull()
  })
})
