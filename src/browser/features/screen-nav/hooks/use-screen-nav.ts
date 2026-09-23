// 画面のナビの帯のロジック（docs/design.md 13.9 / 2章「機能の中を分ける」）。**いま出している
// 画面・3つの口・仕事/雑談のトグル・モデル/許可モードの操作子・狭い画面の「≡」の開閉**を、
// 見た目が受け取れる形まで畳んで返す。「いまの作業」の札は `hooks/use-current-work.ts` に
// 分けてある（別の概念なのでファイルを分ける。CLAUDE.md 原則5）。
//
// **帯に出すのは `Screen` の4つのうち3つ**（作る画面はキャラクター画面から入る一時的な画面なので
// 出さない。13.9）。**口は `<a href>` で、画面の正典は `location.hash` のまま**（`navigateTo` は
// 使わない）。
//
// **動き方の操作子（仕事/雑談・モデル・許可モード）が送るコマンドは、いままでサイドバーの
// `<select>` が送っていたものと同じ**（`set-chat-mode` / `set-model` / `set-permission-mode`）。
// 表示はサーバから届いた値だけに従い、押した側へ先に倒さない（13.9「動き方の操作子」）。
//
// 「≡」を閉じる合図（外側を押した・Esc）は **React の外（document）の購読**なので `useEffect`
// で取る（docs/coding-standards.md「React」の4類型のうち「外部システムの購読」）。**開いている
// 間だけ購読する**ので、閉じている間はハンドラが1つも載らない。

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import { isModelAlias, isPermissionMode } from "../../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../../shared/frame.ts"
import { roomName } from "../../../../shared/room.ts"
import { resolveModelAlias } from "../../../lib/model-label.ts"
import {
  isDangerousPermissionMode,
  resolvePermissionMode,
} from "../../../lib/permission-mode-label.ts"
import { type Screen } from "../../../stores/location-hash.ts"
import { useScreen, useScreenHref } from "../../../stores/screen.tsx"
import { useSessionDispatch, useSessionSelector } from "../../../stores/session.tsx"
import { useCurrentWork, type ScreenNavCurrentWork } from "./use-current-work.ts"

/** 帯に並ぶ口1つ。**「いま出している画面か」は畳んで渡す**（部品は判定を持たない）。 */
export type ScreenNavGate = {
  readonly screen: Screen
  readonly label: string
  readonly href: string
  readonly active: boolean
}

/**
 * 仕事 / 雑談のトグルが受け取れる形（13.9「動き方の操作子」）。**いまの側を押しても
 * 何も送らない**・**ターン進行中は送らない**は `onChange` の中で決めていて、部品は
 * 「送るかどうか」を持たない。
 */
export type ScreenNavChatMode = {
  readonly chat: boolean
  /** ターン進行中は押せない（起こし直しなので、キャラクターの切り替えと同じ条件）。 */
  readonly disabled: boolean
  /** `disabled` のときだけ理由を持つ（`aria-disabled` の要素はツールチップが出ないブラウザ既定に
   * 頼れないので、`title` に定型文を出す）。 */
  readonly title: string | undefined
  readonly onChange: (chat: boolean) => void
}

/** モデル・許可モードの操作子が受け取れる形。**ターン進行中も変えられる**（起こし直さない）。 */
export type ScreenNavModelPermission = {
  readonly model: string
  readonly onSetModel: (value: string) => void
  readonly permissionMode: string
  /** 「全部許す」のときだけ字に意味の色を載せる（13.1 原則5）。 */
  readonly permissionModeDangerous: boolean
  readonly onSetPermissionMode: (value: string) => void
}

/** 帯の左端に出す顔（13.9「顔」）。`url` が無ければ `<ScreenNavFace>` は何も描かない。 */
export type ScreenNavFace = {
  readonly url: string | undefined
  readonly alt: string
}

export type ScreenNavView = {
  /** いま出している画面。**狭い画面での帯の置き方**（タブ帯へ畳むか）を CSS が決めるのに使う。 */
  readonly current: Screen
  /** この tsukumo の部屋の名前（`src/shared/room.ts`。13.9）。 */
  readonly room: string
  /** いまのパックのキャラクターの顔（`CharacterInfo.face`。13.9「顔」）。 */
  readonly face: ScreenNavFace
  readonly gates: readonly ScreenNavGate[]
  readonly chatMode: ScreenNavChatMode
  readonly modelPermission: ScreenNavModelPermission
  /** 狭い画面の「≡」に添える答え待ちの印（●）だけに使う（13.9「いまの作業」）。 */
  readonly pendingActive: boolean
  /** 帯のまん中の札「いまの作業」（`hooks/use-current-work.ts`）。 */
  readonly work: ScreenNavCurrentWork
  /** 広い画面の帯にある札の DOM（Esc でフォーカスを戻す先）。 */
  readonly workToggleRefWide: RefObject<HTMLButtonElement | null>
  /** 狭い画面の「≡」の面の中にある札の DOM（同上）。 */
  readonly workToggleRefNarrow: RefObject<HTMLButtonElement | null>
  readonly menuOpen: boolean
  readonly onToggleMenu: () => void
  readonly onSelect: () => void
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
  const dispatch = useSessionDispatch()
  const current = useScreen()
  const screenHref = useScreenHref()
  const pendingActive = useSessionSelector((session) => session.state.pending.length > 0)
  const chatMode = useSessionSelector((session) => session.state.chatMode)
  const turnInProgress = useSessionSelector((session) => session.state.turn.kind === "running")
  const model = useSessionSelector((session) => session.state.model)
  const permissionMode = useSessionSelector((session) =>
    session.state.session.kind === "running" ? session.state.session.permissionMode : undefined,
  )
  const character = useSessionSelector((session) => session.state.character)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const {
    view: work,
    toggleRefWide: workToggleRefWide,
    toggleRefNarrow: workToggleRefNarrow,
  } = useCurrentWork(ref)

  const onSelect = useCallback((): void => {
    setMenuOpen(false)
  }, [])

  const onToggleMenu = useCallback((): void => {
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
    face: { url: character?.face, alt: character?.name ?? "" },
    gates: NAV_SCREENS.map((entry) => ({
      screen: entry.screen,
      label: entry.label,
      href: screenHref(entry.screen),
      active: entry.screen === current,
    })),
    chatMode: {
      chat: chatMode,
      disabled: turnInProgress,
      title: turnInProgress ? FRAME_ERROR_REASON.chatModeSwitchDuringTurn : undefined,
      onChange: (chat) => {
        if (turnInProgress || chat === chatMode) {
          return
        }
        dispatch({ type: "set-chat-mode", chat })
      },
    },
    modelPermission: {
      model: resolveModelAlias(model),
      onSetModel: (value) => {
        if (isModelAlias(value)) {
          dispatch({ type: "set-model", model: value })
        }
      },
      permissionMode: resolvePermissionMode(permissionMode),
      permissionModeDangerous: isDangerousPermissionMode(resolvePermissionMode(permissionMode)),
      onSetPermissionMode: (value) => {
        if (isPermissionMode(value)) {
          dispatch({ type: "set-permission-mode", mode: value })
        }
      },
    },
    pendingActive,
    work,
    workToggleRefWide,
    workToggleRefNarrow,
    menuOpen,
    onToggleMenu,
    onSelect,
    ref,
  }
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
