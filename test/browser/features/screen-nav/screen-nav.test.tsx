import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ScreenNav } from "../../../../src/browser/features/screen-nav/screen-nav.tsx"
import { QuestionScrollProvider } from "../../../../src/browser/stores/question-scroll.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { TurnSelectionProvider } from "../../../../src/browser/stores/turn-selection.tsx"
import { MODEL_ALIASES } from "../../../../src/shared/command.ts"
import { type PendingAsk } from "../../../../src/shared/pending-ask.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionInfo,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { setPageUrl } from "../../../dom-environment.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

// 手で書いた架空の答え待ち（許可の問い合わせ1件。docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_PENDING: PendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
}

// 部屋の名前はこのページを配っているポートから決まる（`src/shared/room.ts`）ので、
// ポートを見るテストは URL ごと差し替える。既定へ戻すのは afterEach。
const DEFAULT_PAGE_URL = "http://127.0.0.1/"

afterEach(() => {
  cleanup()
  setPageUrl(DEFAULT_PAGE_URL)
  window.location.hash = ""
})

/**
 * `init` が届いたあと（`running`）の架空の土台。`permissionMode` だけ変えて使う。**`model` は
 * ここに無い**（`SessionState.model` は `session` と独立なので、`renderScreenNav` の第一引数に
 * 直接渡す）。既定値は見た目上の既定（`PERMISSION_MODE_FALLBACK`）に合わせてある。
 */
const RUNNING_SESSION: Extract<SessionInfo, { kind: "running" }> = {
  kind: "running",
  sessionId: "s-fixture",
  permissionMode: "auto",
}

function renderScreenNav(state: Partial<SessionState> = {}, spy: CommandSpy = () => {}): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...state }, spy)
  render(
    <SessionStoreContext.Provider value={store}>
      <TurnSelectionProvider>
        <QuestionScrollProvider>
          <ScreenNav />
        </QuestionScrollProvider>
      </TurnSelectionProvider>
    </SessionStoreContext.Provider>,
  )
}

/** 帯に並んでいる口（狭い画面の「≡」の中は数えない）。 */
function gateNames(): readonly string[] {
  return [...document.querySelectorAll(".screen-nav-gates a")].map((node) => node.textContent ?? "")
}

describe("ScreenNav", () => {
  it("3つの口（会話 / キャラクター / トークン消費）を hash のリンクで出す", () => {
    renderScreenNav()

    expect(gateNames()).toEqual(["会話", "キャラクター", "トークン消費"])
    expect(screen.getByRole("link", { name: "会話" }).getAttribute("href")).toBe("#")
    expect(screen.getByRole("link", { name: "キャラクター" }).getAttribute("href")).toBe(
      "#character",
    )
    expect(screen.getByRole("link", { name: "トークン消費" }).getAttribute("href")).toBe(
      "#token-usage",
    )
  })

  // 作る画面はキャラクター画面から入る一時的な画面なので、帯には並べない（13.9）。
  it("作る画面の口は帯に出ない", () => {
    renderScreenNav()

    expect(document.querySelector('.screen-nav a[href="#character/new"]')).toBeNull()
  })

  // **色だけで伝えない**ので、いまの画面の口には地と字の濃さを変える class が付く（13.9）。
  it("いま出している画面の口に is-active が付く", () => {
    window.location.hash = "#token-usage"
    renderScreenNav()

    expect(screen.getByRole("link", { name: "トークン消費" }).className).toContain("is-active")
    expect(screen.getByRole("link", { name: "会話" }).className).not.toContain("is-active")
    expect(screen.getByRole("link", { name: "トークン消費" }).getAttribute("aria-current")).toBe(
      "page",
    )
  })

  it("hash が無いときは会話の口が is-active", () => {
    window.location.hash = ""
    renderScreenNav()

    expect(screen.getByRole("link", { name: "会話" }).className).toContain("is-active")
  })

  // 帯の右端にあった専用の印（screen-nav-pending.tsx）は「いまの作業」の札にまとめた
  // （13.9「何を外すか」）。
  it("答え待ちがあるときだけ、いまの作業の札の語が「答え待ち」になる", () => {
    renderScreenNav()
    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("依頼待ち")

    cleanup()
    renderScreenNav({ pending: [FIXTURE_PENDING] })

    expect(document.querySelector(".screen-nav-work-word")?.textContent).toBe("答え待ち")
  })

  // 部屋の名前は帯の左端（13.9）。**ポートの並び順に割り当たる**（`src/shared/room.ts`）ので、
  // 出ている名前でどの tsukumo を見ているかが分かる。
  it("帯の左端に、このページのポートの部屋の名前を出す", () => {
    setPageUrl("http://127.0.0.1:7329/")
    renderScreenNav()

    expect(document.querySelector(".screen-nav-identity > .screen-nav-room")?.textContent).toBe(
      "菜の花の間",
    )
  })

  // 語彙の外のポートは番号のまま（13個め以降・`TSUKUMO_VIEW_PORT` で遠い番号を指したとき）。
  it("語彙の外のポートでは、番号をそのまま帯に出す", () => {
    setPageUrl("http://127.0.0.1:9000/")
    renderScreenNav()

    expect(document.querySelector(".screen-nav-identity > .screen-nav-room")?.textContent).toBe(
      "9000",
    )
  })

  // 顔は帯の左端、部屋の名前の左（13.9「顔」）。
  describe("顔", () => {
    it("定義に face があれば、alt にキャラクターの名前を付けて出す", () => {
      renderScreenNav({
        character: characterInfo({ name: "架空の精霊", face: "/character/face.png" }),
      })

      const face = document.querySelector(".screen-nav-identity > .screen-nav-face")
      expect(face?.tagName).toBe("IMG")
      expect(face?.getAttribute("src")).toBe("/character/face.png")
      expect(face?.getAttribute("alt")).toBe("架空の精霊")
    })

    it("face が無いパックでは何も出さない（mini や立ち絵からは補わない）", () => {
      renderScreenNav({ character: characterInfo({ face: undefined }) })

      expect(document.querySelector(".screen-nav-identity > .screen-nav-face")).toBeNull()
    })

    it("character が届く前（undefined）も何も出さない", () => {
      renderScreenNav()

      expect(document.querySelector(".screen-nav-identity > .screen-nav-face")).toBeNull()
    })

    it("キャラクターを切り替えると顔も変わる（character-changed で state.character が入れ替わる想定）", () => {
      renderScreenNav({ character: characterInfo({ name: "甲", face: "/character/a-face.png" }) })
      expect(document.querySelector(".screen-nav-face")?.getAttribute("src")).toBe(
        "/character/a-face.png",
      )

      cleanup()
      renderScreenNav({ character: characterInfo({ name: "乙", face: "/character/b-face.png" }) })
      expect(document.querySelector(".screen-nav-face")?.getAttribute("src")).toBe(
        "/character/b-face.png",
      )
      expect(document.querySelector(".screen-nav-face")?.getAttribute("alt")).toBe("乙")
    })

    it("「≡」を開くと、落ちてきた面の先頭にも顔が出る（狭い画面）", () => {
      renderScreenNav({
        character: characterInfo({ name: "架空の精霊", face: "/character/face.png" }),
      })

      fireEvent.click(screen.getByRole("button", { name: "メニュー" }))

      expect(
        document.querySelector(".screen-nav-panel .screen-nav-face")?.getAttribute("src"),
      ).toBe("/character/face.png")
    })
  })

  // 狭い画面の「≡」（広い画面では CSS が消す。ここでは DOM の有無だけを見る）。
  // 「≡」の aria-label は「画面を選ぶ」から「メニュー」に直した（13.9「狭い画面」）。
  it("「≡」を押すと落ちてくる面に3つの口が出て、もう一度押すと閉じる", () => {
    renderScreenNav()
    const toggle = screen.getByRole("button", { name: "メニュー" })
    expect(document.querySelector(".screen-nav-panel")).toBeNull()

    fireEvent.click(toggle)
    const opened = document.querySelector(".screen-nav-panel")
    expect([...(opened?.querySelectorAll("a") ?? [])].map((node) => node.textContent)).toEqual([
      "会話",
      "キャラクター",
      "トークン消費",
    ])
    expect(toggle.getAttribute("aria-expanded")).toBe("true")

    fireEvent.click(toggle)
    expect(document.querySelector(".screen-nav-panel")).toBeNull()
  })

  it("落ちてきた口を押すと閉じる（画面が移るので開いたままにしない）", () => {
    renderScreenNav()
    fireEvent.click(screen.getByRole("button", { name: "メニュー" }))

    const panelGate = document.querySelector(".screen-nav-panel a")
    fireEvent.click(panelGate as Element)

    expect(document.querySelector(".screen-nav-panel")).toBeNull()
  })

  it("帯の外側を押すと閉じる", () => {
    renderScreenNav()
    fireEvent.click(screen.getByRole("button", { name: "メニュー" }))

    fireEvent.pointerDown(document.body)

    expect(document.querySelector(".screen-nav-panel")).toBeNull()
  })

  // 狭い画面は帯の左端が無い（「≡」だけになる）ので、名前は落ちてくる面の先頭に出す（13.9）。
  it("「≡」を開くと、落ちてきた面の先頭にも部屋の名前が出る", () => {
    setPageUrl("http://127.0.0.1:7328/")
    renderScreenNav()

    fireEvent.click(screen.getByRole("button", { name: "メニュー" }))

    expect(document.querySelector(".screen-nav-panel .screen-nav-room")?.textContent).toBe(
      "若葉の間",
    )
  })

  // 答え待ちの間は「≡」に印が付き、開くと面の中の「いまの作業」の札の語でも分かる
  // （狭い画面では帯に「答え待ち」を置く幅が無い。13.9「狭い画面」）。
  it("答え待ちの間は「≡」に印が付き、開くと面の中の札の語でも出る", () => {
    renderScreenNav({ pending: [FIXTURE_PENDING] })
    const toggle = screen.getByRole("button", { name: "メニュー（答え待ち）" })
    expect(document.querySelector(".screen-nav-toggle-mark")).not.toBeNull()

    fireEvent.click(toggle)

    expect(document.querySelector(".screen-nav-panel .screen-nav-work-word")?.textContent).toBe(
      "答え待ち",
    )
  })

  describe("仕事 / 雑談のトグル", () => {
    it("いまの側に aria-pressed が付く", () => {
      renderScreenNav({ chatMode: false })
      expect(screen.getByRole("button", { name: /仕事/ }).getAttribute("aria-pressed")).toBe("true")
      expect(screen.getByRole("button", { name: /雑談/ }).getAttribute("aria-pressed")).toBe(
        "false",
      )

      cleanup()
      renderScreenNav({ chatMode: true })
      expect(screen.getByRole("button", { name: /仕事/ }).getAttribute("aria-pressed")).toBe(
        "false",
      )
      expect(screen.getByRole("button", { name: /雑談/ }).getAttribute("aria-pressed")).toBe("true")
    })

    // 帯の操作子が送るコマンドは、いままでサイドバーの <select> が送っていたものと同じ
    // （`set-chat-mode`。docs/screen-design.md 13.9）。
    it("反対側を押すと set-chat-mode を送る", () => {
      const calls: unknown[] = []
      renderScreenNav({ chatMode: false }, (command) => {
        calls.push(command)
      })

      fireEvent.click(screen.getByRole("button", { name: /雑談/ }))

      expect(calls).toEqual([{ type: "set-chat-mode", chat: true }])
    })

    it("いまの側を押しても何も送らない", () => {
      const calls: unknown[] = []
      renderScreenNav({ chatMode: false }, (command) => {
        calls.push(command)
      })

      fireEvent.click(screen.getByRole("button", { name: /仕事/ }))

      expect(calls).toEqual([])
    })

    it("ターン進行中は押しても送らず、aria-disabled になる", () => {
      const calls: unknown[] = []
      renderScreenNav({ chatMode: false, turn: { kind: "running", startedAt: 0 } }, (command) => {
        calls.push(command)
      })

      const chatButton = screen.getByRole("button", { name: /雑談/ })
      expect(chatButton.getAttribute("aria-disabled")).toBe("true")
      expect(chatButton.getAttribute("title")?.length).toBeGreaterThan(0)

      fireEvent.click(chatButton)

      expect(calls).toEqual([])
    })

    it("ターンが終わると押せる（aria-disabled が外れる）", () => {
      renderScreenNav({ turn: { kind: "idle" } })

      const chatButton = screen.getByRole("button", { name: /雑談/ })
      expect(chatButton.getAttribute("aria-disabled")).toBe("false")
    })
  })

  describe("モデル・許可モードのドロップダウン", () => {
    it("状態の model / permissionMode の値を選択する", () => {
      renderScreenNav({
        model: "claude-sonnet-5",
        session: { ...RUNNING_SESSION, permissionMode: "plan" },
      })

      expect((screen.getByLabelText("モデル") as HTMLSelectElement).value).toBe("sonnet")
      expect((screen.getByLabelText("許可モード") as HTMLSelectElement).value).toBe("plan")
    })

    // 届く前でも見た目上の既定に倒す（サイドバーの <select> と同じ値）。
    it("model / permissionMode が届く前は既定を選択する", () => {
      renderScreenNav()

      expect((screen.getByLabelText("モデル") as HTMLSelectElement).value).toBe("opus")
      expect((screen.getByLabelText("許可モード") as HTMLSelectElement).value).toBe("auto")
    })

    it("モデルの選択肢は MODEL_ALIASES と過不足なく一致する（片方だけの追加漏れを防ぐ）", () => {
      renderScreenNav()

      const select = screen.getByLabelText("モデル") as HTMLSelectElement
      const optionValues = Array.from(select.options).map((option) => option.value)

      expect([...optionValues].sort()).toEqual([...MODEL_ALIASES].sort())
    })

    it("model が fable を含むとき、fable を選択する", () => {
      renderScreenNav({ model: "claude-fable-5-1" })

      expect((screen.getByLabelText("モデル") as HTMLSelectElement).value).toBe("fable")
    })

    it("model が opus のみを含むとき、fable を誤って選択しない", () => {
      renderScreenNav({ model: "claude-opus-5" })

      expect((screen.getByLabelText("モデル") as HTMLSelectElement).value).toBe("opus")
    })

    it("model が sonnet / haiku のとき、fable を誤って選択しない", () => {
      renderScreenNav({ model: "claude-sonnet-5" })
      expect((screen.getByLabelText("モデル") as HTMLSelectElement).value).toBe("sonnet")

      cleanup()
      renderScreenNav({ model: "claude-haiku-5" })
      expect((screen.getByLabelText("モデル") as HTMLSelectElement).value).toBe("haiku")
    })

    // 帯の操作子が送るコマンドは、いままでサイドバーの <select> が送っていたものと同じ。
    it("モデルを変更すると set-model を送る", () => {
      const calls: unknown[] = []
      renderScreenNav({ model: "claude-sonnet-5" }, (command) => {
        calls.push(command)
      })

      fireEvent.change(screen.getByLabelText("モデル"), { target: { value: "opus" } })

      expect(calls).toEqual([{ type: "set-model", model: "opus" }])
    })

    it("許可モードを変更すると set-permission-mode を送る", () => {
      const calls: unknown[] = []
      renderScreenNav({ session: { ...RUNNING_SESSION, permissionMode: "auto" } }, (command) => {
        calls.push(command)
      })

      fireEvent.change(screen.getByLabelText("許可モード"), { target: { value: "plan" } })

      expect(calls).toEqual([{ type: "set-permission-mode", mode: "plan" }])
    })

    it("ターン進行中も無効にならない（起こし直さないため）", () => {
      renderScreenNav({ turn: { kind: "running", startedAt: 0 } })

      expect((screen.getByLabelText("モデル") as HTMLSelectElement).disabled).toBe(false)
      expect((screen.getByLabelText("許可モード") as HTMLSelectElement).disabled).toBe(false)
    })

    // 「全部許す」だけ字に意味の色を載せる（ラベルの文字が必ず付くので色だけに頼らない。13.1 原則5）。
    it("許可モードが「全部許す」のときだけ is-danger が付く", () => {
      renderScreenNav({ session: { ...RUNNING_SESSION, permissionMode: "bypassPermissions" } })
      expect(screen.getByLabelText("許可モード").className).toContain("is-danger")

      cleanup()
      renderScreenNav({ session: { ...RUNNING_SESSION, permissionMode: "acceptEdits" } })
      expect(screen.getByLabelText("許可モード").className).not.toContain("is-danger")
    })

    // 狭い画面では帯に置く幅が無いので、口と同じく「≡」の中へ入る（13.9）。**帯の側にも
    // 同じ部品が残っている**ので、`getByLabelText` は使わず落ちてきた面の中だけを見る。
    it("「≡」を開くと、落ちてきた面にもドロップダウンが出る", () => {
      renderScreenNav({ model: "claude-haiku-5" })

      fireEvent.click(screen.getByRole("button", { name: "メニュー" }))

      const panelModelSelect = document
        .querySelector(".screen-nav-panel")
        ?.querySelector("[aria-label='モデル']") as HTMLSelectElement | undefined
      expect(panelModelSelect).not.toBeUndefined()
      expect(panelModelSelect?.value).toBe("haiku")
    })
  })
})
