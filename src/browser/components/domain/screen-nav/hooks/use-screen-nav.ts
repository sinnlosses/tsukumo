// 画面のナビの帯のロジック。
// いま出している画面・口・仕事/雑談のトグル・モデル/許可モードの操作子・狭い画面の「≡」の開閉を、見た目が受け取れる形まで畳んで返す。
//
// 口は `<a href>` で、画面の正典は `location.hash` のまま（`navigateTo` は使わない）。
//
// 動き方の操作子（仕事/雑談・モデル・許可モード）の表示はサーバから届いた値だけに従い、押した側へ先に倒さない。
//
// 2つの面（広い画面の帯・狭い画面の「≡」の面）へは、部品の値を1つの束（`ScreenNavParts`）で配る。

import { useRef, useState, type RefObject } from "react"

import { isEffortLevel, isModelAlias, isPermissionMode } from "../../../../../shared/command.ts"
import { FRAME_ERROR_REASON } from "../../../../../shared/frame.ts"
import { roomName } from "../../../../../shared/view-server/room.ts"
import { useDismissSignal } from "../../../../hooks/use-dismiss-signal.ts"
import { SCREEN_NAV_ITEMS, type Screen } from "../../../../stores/location-hash.ts"
import { useScreen, useScreenHref } from "../../../../stores/screen.tsx"
import { useSession, useTurnRunning } from "../../../../stores/session.ts"
import { resolveEffortSelect, type EffortSelect } from "../domain/effort-label.ts"
import { resolveModelAlias } from "../domain/model-label.ts"
import {
  isDangerousPermissionMode,
  resolvePermissionMode,
} from "../domain/permission-mode-label.ts"
import { useCharacterPicker, type ScreenNavCharacterPicker } from "./use-character-picker.ts"
import { useCurrentWork, type ScreenNavCurrentWork } from "./use-current-work.ts"
import {
  useSessionSwitcher,
  type ScreenNavSessionSwitcher,
  type ScreenNavSessionTag,
} from "./use-session-switcher.ts"
import { useSettings, type ScreenNavSettings } from "./use-settings.ts"

/** 帯に並ぶ口1つ。「いま出している画面か」は畳んで渡す（部品は判定を持たない）。 */
export type ScreenNavGate = {
  readonly screen: Screen
  readonly label: string
  readonly href: string
  readonly active: boolean
}

/**
 * 仕事 / 雑談のトグルが受け取れる形。
 * いまの側を押しても・ターン進行中も何も送らないことは `onChange` の中で決めていて、部品は「送るかどうか」を持たない。
 */
export type ScreenNavChatMode = {
  readonly chat: boolean
  /** ターン進行中は押せない（起こし直しなので）。 */
  readonly disabled: boolean
  /**
   * `disabled` のときだけ理由を持つ。
   * `aria-disabled` の要素はブラウザ既定のツールチップに頼れないので、`title` に定型文を出す。
   */
  readonly title: string | undefined
  readonly onChange: (chat: boolean) => void
}

/** モデル・effort・許可モードの操作子が受け取れる形。ターン進行中も変えられる（起こし直さない）。 */
export type ScreenNavModelPermission = {
  readonly model: string
  readonly onSetModel: (value: string) => void
  /** 押した値へ先に倒さない。選べる段・いまの値はサーバから届いた値（`model-effort-support` / `effort-changed`）だけに従う。 */
  readonly effort: EffortSelect
  readonly onSetEffort: (value: string) => void
  readonly permissionMode: string
  /** 「全部許す」のときだけ字に意味の色を載せる。 */
  readonly permissionModeDangerous: boolean
  readonly onSetPermissionMode: (value: string) => void
}

/**
 * 帯に並ぶ部品の値ひとそろい。
 * 広い画面の帯と狭い画面の「≡」の面が、この束をそのまま受け取ってそれぞれの並びで置く。
 * どちらを出すかは CSS が決めるので、値の配り方は1本で足りる。
 */
export type ScreenNavParts = {
  readonly character: ScreenNavCharacterPicker
  readonly sessionTag: ScreenNavSessionTag
  readonly gates: readonly ScreenNavGate[]
  readonly chatMode: ScreenNavChatMode
  readonly modelPermission: ScreenNavModelPermission
  readonly work: ScreenNavCurrentWork
  readonly settings: ScreenNavSettings
  /** 口を押したあとに「≡」を閉じる呼び先（広い画面では開いていないので何も起きない）。 */
  readonly onSelect: () => void
}

/** 狭い画面の「≡」そのもの（広い画面では CSS が消す）。 */
export type ScreenNavMenu = {
  readonly open: boolean
  /** 閉じている間だけ「≡」に添える答え待ちの印（●）。 */
  readonly pendingActive: boolean
  readonly onToggle: () => void
}

export type ScreenNavView = {
  /** いま出している画面。狭い画面での帯の置き方（タブ帯へ畳むか）を CSS が決めるのに使う。 */
  readonly current: Screen
  readonly parts: ScreenNavParts
  /** 札を押すと開く切り替え画面（帯の外に1つだけ描く）。 */
  readonly switcher: ScreenNavSessionSwitcher
  readonly menu: ScreenNavMenu
  /** 帯の外側を押したかを見るための入れ物（「≡」を閉じる判定に使う）。 */
  readonly ref: RefObject<HTMLElement | null>
}

export function useScreenNav(): ScreenNavView {
  const dispatch = useSession((session) => session.dispatch)
  const current = useScreen()
  const screenHref = useScreenHref()
  const pendingActive = useSession((session) => session.state.pending.length > 0)
  const chatMode = useSession((session) => session.state.chatMode)
  const turnInProgress = useTurnRunning()
  const model = useSession((session) => session.state.model)
  const modelEffortSupport = useSession((session) => session.state.modelEffortSupport)
  const effort = useSession((session) => session.state.effort)
  const permissionMode = useSession((session) =>
    session.state.session.kind === "running" ? session.state.session.permissionMode : undefined,
  )
  // `init`（`session-info`）が届くまでの畳み先は、このセッションを起こした既定。
  // 同梱の既定に倒すと、歯車で Sonnet にして起こし直した直後の帯だけが Opus を名乗る。
  const sessionDefault = useSession((session) => session.state.sessionDefault)
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const work = useCurrentWork(ref)
  const settings = useSettings(ref)
  const character = useCharacterPicker(ref)
  const { tag: sessionTag, switcher } = useSessionSwitcher(currentRoomName())

  function onSelect(): void {
    setMenuOpen(false)
  }

  function onToggleMenu(): void {
    setMenuOpen((open) => !open)
  }

  function onDismissMenu(): void {
    setMenuOpen(false)
  }

  useDismissSignal({ open: menuOpen, rootRef: ref, onDismiss: onDismissMenu })

  const shownPermissionMode =
    permissionMode === undefined
      ? sessionDefault.permissionMode
      : resolvePermissionMode(permissionMode)
  // effort の選べる段は「いま帯に出しているモデル」で決まるので、model の畳み込みと同じ値を使う。
  const shownModel = model === undefined ? sessionDefault.model : resolveModelAlias(model)

  return {
    current,
    parts: {
      character,
      sessionTag,
      gates: SCREEN_NAV_ITEMS.map((entry) => ({
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
          dispatch.session.setChatMode({ chat })
        },
      },
      modelPermission: {
        model: shownModel,
        onSetModel: (value) => {
          if (isModelAlias(value)) {
            dispatch.session.setModel({ model: value })
          }
        },
        effort: resolveEffortSelect(shownModel, modelEffortSupport, effort),
        onSetEffort: (value) => {
          if (isEffortLevel(value)) {
            dispatch.session.setEffort({ effort: value })
          }
        },
        permissionMode: shownPermissionMode,
        permissionModeDangerous: isDangerousPermissionMode(shownPermissionMode),
        onSetPermissionMode: (value) => {
          if (isPermissionMode(value)) {
            dispatch.session.setPermissionMode({ mode: value })
          }
        },
      },
      work,
      settings,
      onSelect,
    },
    switcher,
    menu: { open: menuOpen, pendingActive, onToggle: onToggleMenu },
    ref,
  }
}

/** `location.port` が空文字のときに補う、http の既定ポート（URL がポートを省いた形のとき）。 */
const DEFAULT_HTTP_PORT = 80

/**
 * この tsukumo の部屋の名前。
 * どの部屋かの正典は、このページを配っている URL のポート（サーバがそのポートで待っている）で、サーバから送り直してもらう値ではないので状態には乗せない。
 *
 * 購読はしない（ポートはページの一生の間変わらない）。
 */
function currentRoomName(): string {
  const port = window.location.port
  return roomName(port === "" ? DEFAULT_HTTP_PORT : Number(port))
}
