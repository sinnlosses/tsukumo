import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScreenNav } from "../../../../../src/browser/components/domain/screen-nav/screen-nav.tsx"
import { useNavDrawer } from "../../../../../src/browser/stores/nav-drawer.ts"
import { MODEL_ALIASES } from "../../../../../src/shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../../../src/shared/frame.ts"
import type { StampedPendingAsk } from "../../../../../src/shared/session-driver/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionInfo,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { setPageUrl } from "../../../../dom-environment.ts"
import { characterInfo, characterPackEntry } from "../../../../fixture/character.ts"
import { typedElement } from "../../../../typed-element.ts"
import { MARKED_NAV_DRAWER_SLOTS } from "../../../nav-drawer-slot.tsx"
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

afterEach(() => {
  cleanup()
  useNavDrawer.setState(useNavDrawer.getInitialState(), true)
  setPageUrl(DEFAULT_PAGE_URL)
  window.location.hash = ""
})

/**
 * `init` が届いたあと（`running`）の架空の土台。`permissionMode` だけ変えて使う。`model` は
 * ここに無い（`SessionState.model` は `session` と独立なので、`renderScreenNav` の第一引数に
 * 直接渡す）。既定値は見た目上の既定（`PERMISSION_MODE_FALLBACK`）に合わせてある。
 */
const RUNNING_SESSION: Extract<SessionInfo, { kind: "running" }> = {
  kind: "running",
  sessionId: "s-fixture",
  permissionMode: "auto",
}

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
  // 色だけで伝えないので、いまの画面の口には地と字の濃さを変える class が付く（docs/architecture/screen-design.md「画面のナビゲーション」）。
  it("いま出している画面の口に is-active が付く", () => {
    window.location.hash = "#token-usage"
    renderScreenNav()

    expect(screen.getByRole("link", { name: "トークン" }).className).toContain("is-active")
    expect(screen.getByRole("link", { name: "会話" }).className).not.toContain("is-active")
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

  // 顔の右下の「⌄」で開くキャラクターの選び口（13.9「キャラクターの選び口」）。
  describe("キャラクターの選び口", () => {
    const PACKS = [
      characterPackEntry("fictional", "架空の精霊"),
      characterPackEntry("local", "架空の同居人"),
    ]

    it("顔を押すと選び口が開き、ほかのキャラクターを選ぶと switchCharacter を送って閉じる", () => {
      const sent: SentCommand[] = []
      renderScreenNav(
        {
          character: characterInfo({ pack: "fictional", name: "架空の精霊" }),
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
          character: characterInfo({ pack: "fictional", name: "架空の精霊" }),
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
      expect(within(drawer).getByRole("group", { name: "モード" })).toBeDefined()
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

    it("引き出しの中でキャラクターの選び口を開いたまま覆いを押して閉じても、開き直したとき選び口は閉じている", () => {
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
      expect(within(face).getByText("画面の色")).toBeDefined()
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

    // 答え待ちは頭の状態の語が言うので、≡ には印を添えない（13.9「狭い画面（760px 以下）」）。
    it("答え待ちの間も ≡ の名前は変わらず、頭の状態の語が「答え待ち」になる", () => {
      renderScreenNav({ pending: [FIXTURE_PENDING] })

      expect(drawerToggle()).toBeDefined()
      expect(document.querySelector(".phone-head-word")?.textContent).toBe("答え待ち")
    })
  })

  describe("仕事 / 雑談のトグル", () => {
    it("反対側の名前を title にも渡す", () => {
      renderScreenNav({ chatMode: false })

      expect(screen.getByRole("button", { name: "雑談" }).getAttribute("title")).toBe("雑談")
    })

    // 帯の操作子が送るコマンドは、いままでサイドバーの <select> が送っていたものと同じ
    // （`session.setChatMode`。docs/architecture/screen-design.md「画面のナビゲーション」）。
    it("反対側を押すと session.setChatMode を送る", () => {
      const calls: unknown[] = []
      renderScreenNav({ chatMode: false }, (command) => {
        calls.push(command)
      })

      fireEvent.click(screen.getByRole("button", { name: /雑談/ }))

      expect(calls).toEqual([{ procedure: "session.setChatMode", chat: true }])
    })

    it("いまの側を押しても何も送らない", () => {
      const calls: unknown[] = []
      renderScreenNav({ chatMode: false }, (command) => {
        calls.push(command)
      })

      fireEvent.click(screen.getByRole("button", { name: /仕事/ }))

      expect(calls).toEqual([])
    })

    it("ターン進行中は aria-disabled になり、title に理由が出る", () => {
      renderScreenNav({ chatMode: false, turn: { kind: "running", startedAt: 0 } })

      const chatButton = screen.getByRole("button", { name: /雑談/ })
      expect(chatButton.getAttribute("aria-disabled")).toBe("true")
      expect(chatButton.getAttribute("title")?.length).toBeGreaterThan(0)
    })
  })

  describe("モデル・許可モードのドロップダウン", () => {
    // 会話の画面の帯にはドロップダウンが無い（サイドバーの下端の帯が持つ）ので、ほかの画面で見る。
    beforeEach(() => {
      window.location.hash = "#character"
    })

    it("状態の model / permissionMode の値を選択する", () => {
      renderScreenNav({
        model: "claude-sonnet-5",
        session: { ...RUNNING_SESSION, permissionMode: "plan" },
      })

      expect(
        typedElement(screen.getByLabelText("モデル"), HTMLSelectElement, "モデルの<select>").value,
      ).toBe("sonnet")
      expect(
        typedElement(screen.getByLabelText("許可モード"), HTMLSelectElement, "許可モードの<select>")
          .value,
      ).toBe("plan")
    })

    it("モデルの選択肢は MODEL_ALIASES と過不足なく一致する（片方だけの追加漏れを防ぐ）", () => {
      renderScreenNav()

      const select = typedElement(
        screen.getByLabelText("モデル"),
        HTMLSelectElement,
        "モデルの<select>",
      )
      const optionValues = Array.from(select.options).map((option) => option.value)

      expect([...optionValues].sort()).toEqual([...MODEL_ALIASES].sort())
    })

    // 帯の操作子が送るコマンドは、いままでサイドバーの <select> が送っていたものと同じ。
    it("モデルを変更すると session.setModel を送る", () => {
      const calls: unknown[] = []
      renderScreenNav({ model: "claude-sonnet-5" }, (command) => {
        calls.push(command)
      })

      fireEvent.change(screen.getByLabelText("モデル"), { target: { value: "opus" } })

      expect(calls).toEqual([{ procedure: "session.setModel", model: "opus" }])
    })

    it("許可モードを変更すると session.setPermissionMode を送る", () => {
      const calls: unknown[] = []
      renderScreenNav({ session: { ...RUNNING_SESSION, permissionMode: "auto" } }, (command) => {
        calls.push(command)
      })

      fireEvent.change(screen.getByLabelText("許可モード"), { target: { value: "plan" } })

      expect(calls).toEqual([{ procedure: "session.setPermissionMode", mode: "plan" }])
    })

    it("ターン進行中も無効にならない（起こし直さないため）", () => {
      renderScreenNav({ turn: { kind: "running", startedAt: 0 } })

      expect(
        typedElement(screen.getByLabelText("モデル"), HTMLSelectElement, "モデルの<select>")
          .disabled,
      ).toBe(false)
      expect(
        typedElement(screen.getByLabelText("許可モード"), HTMLSelectElement, "許可モードの<select>")
          .disabled,
      ).toBe(false)
    })

    // 「全部許す」だけ字に意味の色を載せる（ラベルの文字が必ず付くので色だけに頼らない。13.1 原則5）。
    it("許可モードが「全部許す」のとき is-danger が付く", () => {
      renderScreenNav({ session: { ...RUNNING_SESSION, permissionMode: "bypassPermissions" } })
      expect(screen.getByLabelText("許可モード").className).toContain("is-danger")
    })
  })

  // モデルの隣、モデル → effort → 許可モードの並び（13.9「動き方の操作子」）。
  describe("effort のドロップダウン", () => {
    // 会話の画面の帯にはドロップダウンが無い（サイドバーの下端の帯が持つ）ので、ほかの画面で見る。
    beforeEach(() => {
      window.location.hash = "#character"
    })

    const OPUS_SUPPORT = {
      model: "opus",
      supportsEffort: true,
      effortLevels: ["low", "medium", "high", "xhigh", "max"],
    } as const

    it("対応表も読み取った値もまだ届いていないうちは選べず、title に理由が出る", () => {
      renderScreenNav()

      const select = typedElement(
        screen.getByLabelText("effort"),
        HTMLSelectElement,
        "effortの<select>",
      )
      expect(select.disabled).toBe(true)
      expect(select.title.length).toBeGreaterThan(0)
    })

    it("対応表が届き effort も読めたら、選べる段だけを選択肢にして読んだ値を選択する", () => {
      renderScreenNav({
        model: "claude-opus-5",
        modelEffortSupport: [OPUS_SUPPORT],
        effort: "high",
      })

      const select = typedElement(
        screen.getByLabelText("effort"),
        HTMLSelectElement,
        "effortの<select>",
      )
      expect(select.disabled).toBe(false)
      expect(select.value).toBe("high")
      expect(Array.from(select.options).map((option) => option.value)).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
      ])
    })

    it("押した値へ先に倒さない：session.setEffort を送ってもすぐには表示が変わらない", () => {
      const calls: unknown[] = []
      renderScreenNav(
        { model: "claude-opus-5", modelEffortSupport: [OPUS_SUPPORT], effort: "low" },
        (command) => {
          calls.push(command)
        },
      )

      fireEvent.change(screen.getByLabelText("effort"), { target: { value: "high" } })

      expect(calls).toEqual([{ procedure: "session.setEffort", effort: "high" }])
      // 状態の effort をまだ変えていないので、表示は送る前の値のまま。
      expect(
        typedElement(screen.getByLabelText("effort"), HTMLSelectElement, "effortの<select>").value,
      ).toBe("low")
    })
  })
})
