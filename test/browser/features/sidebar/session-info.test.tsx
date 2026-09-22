import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SessionInfo } from "../../../../src/browser/features/sidebar/session-info.tsx"
import { SessionStoreContext } from "../../../../src/browser/stores/session.tsx"
import { MODEL_ALIASES } from "../../../../src/shared/command.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../../src/shared/session-state.ts"
import { characterInfo } from "../../../fixture/character.ts"
import { type CommandSpy, sessionStoreWith } from "../../session-store.ts"

afterEach(() => {
  cleanup()
})

/**
 * 本物の WebSocket 接続（`<App>`）を経由せず、`SessionContext` へ直接値を差し込んで描く
 * （`src/browser/stores/session.tsx` が部品のテスト用に Context 自体を公開している）。
 */
function renderSessionInfo(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  const store = sessionStoreWith({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(
    <SessionStoreContext.Provider value={store}>
      <SessionInfo />
    </SessionStoreContext.Provider>,
  )
}

// 手で書いた架空のキャラクター定義（docs/coding-standards.md「会話内容の扱い」）。
const FIXTURE_CHARACTER: NonNullable<SessionState["character"]> = characterInfo({
  pack: undefined,
})

function selectValue(element: HTMLElement): string {
  return (element as HTMLSelectElement).value
}

describe("SessionInfo", () => {
  it("状態の model / permissionMode の値を <select> に選択する", () => {
    renderSessionInfo({ model: "claude-sonnet-5", permissionMode: "plan" })

    expect(selectValue(screen.getByLabelText("モデル"))).toBe("sonnet")
    expect(selectValue(screen.getByLabelText("許可モード"))).toBe("plan")
  })

  it("キャラクターの <select> は選択肢が1つでも出す", () => {
    renderSessionInfo({
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター")
    expect(selectValue(select)).toBe("tsukumo-spirit")
    expect((select as HTMLSelectElement).options).toHaveLength(1)
  })

  // キャラクター画面への入る口は**帯**（`features/screen-nav/`）へ移った（docs/design.md 13.9）。
  // ここには同じ口を2つ置かない。
  it("キャラクターの行にキャラクター画面への口は置かない", () => {
    renderSessionInfo({
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    expect(document.querySelector('a[href="#character"]')).toBeNull()
  })

  it("キャラクターを変更すると switch-character が dispatch される", () => {
    const calls: unknown[] = []
    renderSessionInfo(
      {
        characterPacks: [
          { name: "tsukumo-spirit", label: "つくもの精霊" },
          { name: "local", label: "架空の同居人" },
        ],
        character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
      },
      (command) => {
        calls.push(command)
      },
    )

    fireEvent.change(screen.getByLabelText("キャラクター"), { target: { value: "local" } })

    expect(calls).toEqual([{ type: "switch-character", name: "local" }])
  })

  it("ターン進行中はキャラクターの <select> が無効になり、理由が title に出る", () => {
    renderSessionInfo({
      turn: { kind: "running", startedAt: 0 },
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター") as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.title.length).toBeGreaterThan(0)
  })

  it("ターンが終わるとキャラクターの <select> は有効に戻る", () => {
    renderSessionInfo({
      turn: { kind: "idle" },
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
    })

    const select = screen.getByLabelText("キャラクター") as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(select.title).toBe("")
  })

  it("ターン進行中でもモデル・許可モードの <select> は無効にしない（会話は消えないため）", () => {
    renderSessionInfo({ turn: { kind: "running", startedAt: 0 } })

    expect((screen.getByLabelText("モデル") as HTMLSelectElement).disabled).toBe(false)
    expect((screen.getByLabelText("許可モード") as HTMLSelectElement).disabled).toBe(false)
  })

  it("状態の chatMode をモードの <select> に選択する", () => {
    renderSessionInfo({ chatMode: false })
    expect(selectValue(screen.getByLabelText("モード"))).toBe("work")

    cleanup()
    renderSessionInfo({ chatMode: true })
    expect(selectValue(screen.getByLabelText("モード"))).toBe("chat")
  })

  it("モードを変更すると set-chat-mode が dispatch される", () => {
    const calls: unknown[] = []
    renderSessionInfo({ chatMode: false }, (command) => {
      calls.push(command)
    })

    fireEvent.change(screen.getByLabelText("モード"), { target: { value: "chat" } })

    expect(calls).toEqual([{ type: "set-chat-mode", chat: true }])
  })

  it("ターン進行中はモードの <select> が無効になり、理由が title に出る", () => {
    // 切り替えは駆動の起こし直しで画面が初期化されるので、キャラクターの <select> と
    // 同じ条件で塞ぐ（docs/requirements.md 4.9）。
    renderSessionInfo({ turn: { kind: "running", startedAt: 0 } })

    const select = screen.getByLabelText("モード") as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.title.length).toBeGreaterThan(0)
  })

  it("ターンが終わるとモードの <select> は有効に戻る", () => {
    renderSessionInfo({ turn: { kind: "idle" } })

    const select = screen.getByLabelText("モード") as HTMLSelectElement
    expect(select.disabled).toBe(false)
    expect(select.title).toBe("")
  })

  it("パックの一覧が届いていなければ、キャラクターの <select> は出さない", () => {
    renderSessionInfo({})

    expect(screen.queryByLabelText("キャラクター")).toBeNull()
  })

  it("モデルの<select>の選択肢は MODEL_ALIASES と過不足なく一致する（片方だけの追加漏れを防ぐ）", () => {
    renderSessionInfo({})

    const select = screen.getByLabelText("モデル") as HTMLSelectElement
    const optionValues = Array.from(select.options).map((option) => option.value)

    expect([...optionValues].sort()).toEqual([...MODEL_ALIASES].sort())
  })

  it("model が fable を含むとき、モデルの<select>は fable を選択する", () => {
    renderSessionInfo({ model: "claude-fable-5-1" })

    expect(selectValue(screen.getByLabelText("モデル"))).toBe("fable")
  })

  it("model が opus のみを含むとき、fable を誤って選択しない", () => {
    renderSessionInfo({ model: "claude-opus-5" })

    expect(selectValue(screen.getByLabelText("モデル"))).toBe("opus")
  })

  it("model が sonnet / haiku のとき、fable を誤って選択しない", () => {
    renderSessionInfo({ model: "claude-sonnet-5" })
    expect(selectValue(screen.getByLabelText("モデル"))).toBe("sonnet")

    cleanup()
    renderSessionInfo({ model: "claude-haiku-5" })
    expect(selectValue(screen.getByLabelText("モデル"))).toBe("haiku")
  })

  it("モデルを変更すると set-model が dispatch される", () => {
    const calls: unknown[] = []
    renderSessionInfo({ model: "claude-sonnet-5" }, (command) => {
      calls.push(command)
    })

    fireEvent.change(screen.getByLabelText("モデル"), { target: { value: "opus" } })

    expect(calls).toEqual([{ type: "set-model", model: "opus" }])
  })

  it("許可モードを変更すると set-permission-mode が dispatch される", () => {
    const calls: unknown[] = []
    renderSessionInfo({ permissionMode: "auto" }, (command) => {
      calls.push(command)
    })

    fireEvent.change(screen.getByLabelText("許可モード"), { target: { value: "plan" } })

    expect(calls).toEqual([{ type: "set-permission-mode", mode: "plan" }])
  })

  it("bypassPermissions を選ぶと警告の見た目のクラスが付く", () => {
    renderSessionInfo({ permissionMode: "bypassPermissions" })

    expect(screen.getByLabelText("許可モード").className).toContain("permission-mode-select-danger")
  })

  it("bypassPermissions 以外では警告のクラスが付かない", () => {
    renderSessionInfo({ permissionMode: "auto" })

    expect(screen.getByLabelText("許可モード").className).not.toContain(
      "permission-mode-select-danger",
    )
  })
})

// 作業先・ブランチ・コードの出所の行は T-365 で外した（ブランチは帯の読みへ、パスは部屋の名前の
// title へ移った。`workspace-notice.tsx` の冒頭コメント）。ここに残るのは知らせと並び順だけ。
describe("SessionInfo の知らせと並び", () => {
  it("作業場所の知らせを、改行を保ったまま出す", () => {
    const notice = [
      "マージが衝突したので止めた（本体は元に戻した）",
      "ブランチ: tsukumo/20260922-153012",
      "次の手: worktree で git merge main して解き、もう一度マージを頼む",
    ].join("\n")

    renderSessionInfo({ workspaceNotices: [notice] })

    expect(screen.getByText("知らせ")).toBeDefined()
    // 既定の照合は空白を畳むので、改行ごと残っていることは中身そのもので確かめる。
    expect(screen.getByText(/マージが衝突したので止めた/).textContent).toBe(notice)
  })

  it("知らせが無ければ知らせの行を出さない", () => {
    renderSessionInfo({})

    expect(screen.queryByText("知らせ")).toBeNull()
  })

  it("作業先・ブランチ・コードの出所の行はもう出さない", () => {
    renderSessionInfo({
      workspace: {
        source: "/repo",
        workdir: {
          kind: "worktree",
          path: "/repo/.git/tsukumo/worktree/20260922-153012",
          branch: "tsukumo/20260922-153012",
          origin: "/repo",
        },
      },
    })

    expect(screen.queryByText("作業先")).toBeNull()
    expect(screen.queryByText("ブランチ")).toBeNull()
    expect(screen.queryByText("コードの出所")).toBeNull()
  })

  it("並びは 知らせ・モード・モデル・許可モード・キャラクター・セッション の順", () => {
    renderSessionInfo({
      workspaceNotices: ["畳めなかった worktree がある"],
      characterPacks: [{ name: "tsukumo-spirit", label: "つくもの精霊" }],
      character: { ...FIXTURE_CHARACTER, pack: "tsukumo-spirit" },
      sessions: [{ sessionId: "s1", viewPort: 7327, lastModified: 0 }],
      sessionId: "s1",
    })

    const labels = screen
      .getAllByText(/^(知らせ|モード|モデル|許可モード|キャラクター|セッション)$/)
      .map((element) => element.textContent)

    expect(labels).toEqual([
      "知らせ",
      "モード",
      "モデル",
      "許可モード",
      "キャラクター",
      "セッション",
    ])
  })
})
