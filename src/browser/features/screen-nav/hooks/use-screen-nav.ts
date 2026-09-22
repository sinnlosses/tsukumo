// 画面のナビの帯のロジック（docs/design.md 13.9 / 2章「機能の中を分ける」）。**いま出している
// 画面・3つの口・答え待ちの印・狭い画面の「≡」の開閉**を、見た目が受け取れる形まで畳んで返す。
//
// **帯に出すのは `Screen` の4つのうち3つ**（作る画面はキャラクター画面から入る一時的な画面なので
// 出さない。13.9）。**口は `<a href>` で、画面の正典は `location.hash` のまま**（`navigateTo` は
// 使わない）。
//
// 「≡」を閉じる合図（外側を押した・Esc）は **React の外（document）の購読**なので `useEffect`
// で取る（docs/coding-standards.md「React」の4類型のうち「外部システムの購読」）。**開いている
// 間だけ購読する**ので、閉じている間はハンドラが1つも載らない。

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import { roomName } from "../../../../shared/room.ts"
import { type Workspace } from "../../../../shared/workspace.ts"
import { modelLabel, resolveModelAlias } from "../../../lib/model-label.ts"
import {
  isDangerousPermissionMode,
  permissionModeLabel,
  resolvePermissionMode,
} from "../../../lib/permission-mode-label.ts"
import { screenHash, useScreen, type Screen } from "../../../stores/screen.tsx"
import { useSessionSelector } from "../../../stores/session.tsx"

/**
 * 帯に出す読み1つ（13.9「何を帯に出すか」）。**資格は「画面を見ても分からず、かつターンの
 * 結果を変えるもの」**で、いまは モデル / 許可モード / ブランチ の3つ。
 *
 * **「無い」はここへ来る前に畳んである**（ブランチは worktree を切っているときだけ一覧に並び、
 * モデルと許可モードは届く前でも見た目上の既定に倒れる）ので、描く側は分岐を持たない。
 */
export type ScreenNavReading = {
  readonly kind: "model" | "permission-mode" | "branch"
  readonly text: string
  /** 「全部許す」のときだけ字に意味の色を載せる（13.1 原則5）。 */
  readonly dangerous: boolean
}

/** 帯に並ぶ口1つ。**「いま出している画面か」は畳んで渡す**（部品は判定を持たない）。 */
export type ScreenNavGate = {
  readonly screen: Screen
  readonly label: string
  readonly href: string
  readonly active: boolean
}

export type ScreenNavView = {
  /** いま出している画面。**狭い画面での帯の置き方**（タブ帯へ畳むか）を CSS が決めるのに使う。 */
  readonly current: Screen
  /** この tsukumo の部屋の名前（`src/shared/room.ts`。13.9）。 */
  readonly room: string
  /**
   * 部屋の名前に触れたときに出す2行（作業先とコードの出所）。**まだ届いていなければ空**で、
   * そのときは `title` を付けない（13.9）。
   */
  readonly roomPlaces: string
  /** いまの動き方の読み（モデル・許可モード・ブランチ）。 */
  readonly readings: readonly ScreenNavReading[]
  readonly gates: readonly ScreenNavGate[]
  readonly pendingActive: boolean
  readonly menuOpen: boolean
  readonly toggleMenu: () => void
  readonly closeMenu: () => void
  /** 帯の外側を押したかを見るための入れ物（「≡」を閉じる判定に使う）。 */
  readonly ref: RefObject<HTMLElement | null>
}

// 帯に出す画面と、その字。**作る画面（`#character/new`）は入れない**（13.9）。
// 名前は用語集の語のまま（docs/glossary.md）。
const NAV_SCREENS = [
  { screen: "conversation", label: "会話" },
  { screen: "character", label: "キャラクター" },
  { screen: "token-usage", label: "トークン消費" },
] satisfies readonly { readonly screen: Screen; readonly label: string }[]

export function useScreenNav(): ScreenNavView {
  const current = useScreen()
  const pendingActive = useSessionSelector((session) => session.state.pending.length > 0)
  const model = useSessionSelector((session) => session.state.model)
  const permissionMode = useSessionSelector((session) => session.state.permissionMode)
  const workspace = useSessionSelector((session) => session.state.workspace)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)

  const closeMenu = useCallback((): void => {
    setMenuOpen(false)
  }, [])

  const toggleMenu = useCallback((): void => {
    setMenuOpen((open) => !open)
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    function closeOnOutside(event: PointerEvent): void {
      const root = ref.current
      if (root !== null && event.target instanceof Node && !root.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [menuOpen])

  return {
    current,
    room: currentRoomName(),
    roomPlaces: roomPlaces(workspace),
    readings: sessionReadings(model, permissionMode, workspace),
    gates: NAV_SCREENS.map((entry) => ({
      screen: entry.screen,
      label: entry.label,
      href: screenHash(entry.screen),
      active: entry.screen === current,
    })),
    pendingActive,
    menuOpen,
    toggleMenu,
    closeMenu,
    ref,
  }
}

/**
 * 帯に出す読みの一覧。**モデルと許可モードは必ず出し、ブランチは worktree を切っているときだけ**
 * （切っていない `direct` と、`workspace` がまだ届いていないときは何も出さない —
 * 「切っていない」を字で言うより、並びが2つになるほうが静かなため。13.9）。
 *
 * 並びは モデル（等幅）→ 許可モード（本文書体）→ ブランチ（等幅）で、**区切りの記号は置かず
 * 書体の交替で区切る**（13.1 原則3）。
 */
function sessionReadings(
  model: string | undefined,
  permissionMode: string | undefined,
  workspace: Workspace | undefined,
): readonly ScreenNavReading[] {
  const mode = resolvePermissionMode(permissionMode)
  return [
    { kind: "model", text: modelLabel(resolveModelAlias(model)), dangerous: false },
    {
      kind: "permission-mode",
      text: permissionModeLabel(mode),
      dangerous: isDangerousPermissionMode(mode),
    },
    ...branchReadings(workspace),
  ]
}

/** worktree を切っているときだけ、ブランチの読みを1つ返す（それ以外は空）。 */
function branchReadings(workspace: Workspace | undefined): readonly ScreenNavReading[] {
  if (workspace === undefined || workspace.workdir.kind !== "worktree") {
    return []
  }

  return [{ kind: "branch", text: workspace.workdir.branch, dangerous: false }]
}

/**
 * 部屋の名前に添える2行（作業先とコードの出所）。**この2つは常に食い違う**ので、どちらの
 * パスも触れば読めるようにしておく（`docs/architecture.md`「worktree でセッションを分ける」）。
 * **帯には字として出さない** — 長いパスは口と読みを押し出すため。
 */
function roomPlaces(workspace: Workspace | undefined): string {
  if (workspace === undefined) {
    return ""
  }

  return `作業先: ${workspace.workdir.path}\nコードの出所: ${workspace.source}`
}

/** `location.port` が空文字のときに補う、http の既定ポート（URL がポートを省いた形のとき）。 */
const DEFAULT_HTTP_PORT = 80

/**
 * この tsukumo の部屋の名前。**どの部屋かの正典は、このページを配っている URL のポート**
 * （サーバがそのポートで待っている。`src/server/core/port-resolution.ts`）——サーバから
 * 送り直してもらう値ではないので、状態には乗せない。
 *
 * **購読はしない**（ポートはページの一生の間変わらない）。
 */
function currentRoomName(): string {
  const port = window.location.port
  return roomName(port === "" ? DEFAULT_HTTP_PORT : Number(port))
}
