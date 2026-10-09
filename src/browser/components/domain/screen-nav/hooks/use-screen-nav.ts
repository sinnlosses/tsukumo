// 画面のナビの帯のロジック。
// いま出している画面・口・仕事/雑談のトグル・モデル/許可モードの操作子・狭い画面の頭と引き出しを、見た目が受け取れる形まで畳んで返す。
//
// 口は `<a href>` で、画面の正典は `location.hash` のまま（`navigateTo` は使わない）。
//
// 動き方の操作子（仕事/雑談・モデル・許可モード）の表示はサーバから届いた値だけに従い、押した側へ先に倒さない。
//
// 2つの面（広い画面の帯・狭い画面の引き出し）へは、部品の値を1つの束（`ScreenNavParts`）で配る。

import { useRef, type RefObject } from "react"

import { FRAME_ERROR_REASON } from "../../../../../shared/frame.ts"
import { roomName } from "../../../../../shared/view-server/room.ts"
import {
  useCurrentWork,
  type CurrentWork,
} from "../../../../features/current-work/hooks/use-current-work.ts"
import { SCREEN_NAV_ITEMS, type Screen } from "../../../../stores/location-hash.ts"
import {
  useModelPermission,
  type ModelPermissionControl,
} from "../../../../stores/model-permission.ts"
import {
  useNavDrawer,
  type NavDrawerFace,
  type NavDrawerTab,
} from "../../../../stores/nav-drawer.ts"
import { useScreen, useScreenHref } from "../../../../stores/screen.tsx"
import { useSession, useTurnRunning } from "../../../../stores/session.ts"
import { useCharacterPicker, type ScreenNavCharacterPicker } from "./use-character-picker.ts"
import { usePhoneHead, type PhoneHead } from "./use-phone-head.ts"
import { useProjectName } from "./use-project-name.ts"
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

/**
 * 帯に並ぶ部品の値ひとそろい。
 * 広い画面の帯と狭い画面の引き出しが、この束をそのまま受け取ってそれぞれの並びで置く。
 * どちらを出すかは CSS が決めるので、値の配り方は1本で足りる。
 */
export type ScreenNavParts = {
  readonly character: ScreenNavCharacterPicker
  readonly sessionTag: ScreenNavSessionTag
  readonly gates: readonly ScreenNavGate[]
  readonly chatMode: ScreenNavChatMode
  readonly modelPermission: ModelPermissionControl
  readonly work: CurrentWork
  readonly settings: ScreenNavSettings
  /** 口を押したあとに引き出しを閉じる呼び先（広い画面では開いていないので何も起きない）。 */
  readonly onSelect: () => void
}

/** 引き出しの切り替えのタブ1つ。 */
export type NavDrawerTabView = {
  readonly tab: NavDrawerTab
  readonly label: string
  readonly selected: boolean
}

/**
 * 引き出しの下端の「＋ 新しいやり取り」。
 * ターン進行中は何も送らないことは `onStart` の中で決めていて、部品は「送るかどうか」を持たない。
 */
export type NavDrawerNewSession = {
  readonly disabled: boolean
  /** `disabled` のときだけ理由を持つ。 */
  readonly title: string | undefined
  readonly onStart: () => void
}

/** 狭い画面の頭の ≡ と、押すと右から出る引き出し（広い画面では頭ごと CSS が消す）。 */
export type NavDrawerView = {
  readonly open: boolean
  /** 閉じたときにフォーカスを戻す先（≡）。 */
  readonly toggleRef: RefObject<HTMLButtonElement | null>
  /** ≡ を押したとき。開いているあいだ ≡ は覆いの下にあって押せないので、開くだけ。 */
  readonly onOpen: () => void
  /** `<dialog>` が閉じたとき（覆い・Esc・中から閉じる）。 */
  readonly onClose: () => void
  readonly tabs: readonly NavDrawerTabView[]
  readonly tab: NavDrawerTab
  readonly onSelectTab: (tab: NavDrawerTab) => void
  readonly newSession: NavDrawerNewSession
  /** 切り替えとタブの中身を出しているか、歯車で入れ替えた設定の面を出しているか。 */
  readonly face: NavDrawerFace
  readonly onShowSettings: () => void
  readonly onShowTabs: () => void
  /** 設定の面の先頭に並べる、会話を除いた画面の口。 */
  readonly screenGates: readonly ScreenNavGate[]
}

export type ScreenNavView = {
  /** いま出している画面。狭い画面での帯の置き方を CSS が決めるのに使う。 */
  readonly current: Screen
  readonly parts: ScreenNavParts
  /** 札を押すと開く切り替え画面（帯の外に1つだけ描く）。 */
  readonly switcher: ScreenNavSessionSwitcher
  readonly drawer: NavDrawerView
  /** 狭い画面の頭（広い画面では CSS が消す）。 */
  readonly head: PhoneHead
  /** 帯の外側を押したかを見るための入れ物（キャラクターの選び口などを閉じる判定に使う）。 */
  readonly ref: RefObject<HTMLElement | null>
}

/** タブの字。雑談中は「タスク」の席が「話題」になる。 */
const TAB_LABELS = {
  turns: "やり取り",
  tasks: "タスク",
  usage: "使用量",
} satisfies Record<NavDrawerTab, string>

const CHAT_TASKS_LABEL = "話題"

const TAB_ORDER = ["turns", "tasks", "usage"] as const satisfies readonly NavDrawerTab[]

export function useScreenNav(): ScreenNavView {
  const dispatch = useSession((session) => session.dispatch)
  const current = useScreen()
  const screenHref = useScreenHref()
  const chatMode = useSession((session) => session.state.chatMode)
  const turnInProgress = useTurnRunning()
  const drawerOpen = useNavDrawer((state) => state.open)
  const drawerTab = useNavDrawer((state) => state.tab)
  const openDrawer = useNavDrawer((state) => state.openDrawer)
  const closeDrawer = useNavDrawer((state) => state.close)
  const selectTab = useNavDrawer((state) => state.selectTab)
  const drawerFace = useNavDrawer((state) => state.face)
  const showSettings = useNavDrawer((state) => state.showSettings)
  const showTabs = useNavDrawer((state) => state.showTabs)
  const ref = useRef<HTMLElement>(null)
  const drawerToggleRef = useRef<HTMLButtonElement>(null)
  const work = useCurrentWork(ref)
  const modelPermission = useModelPermission()
  const settings = useSettings(ref)
  const character = useCharacterPicker(ref)
  const roomName = currentRoomName()
  const { tag: sessionTag, switcher } = useSessionSwitcher(roomName, useProjectName())
  const head = usePhoneHead({
    current,
    work,
    face: character.face,
    roomName,
    conversationHref: screenHref("conversation"),
  })

  const gates = SCREEN_NAV_ITEMS.map((entry) => ({
    screen: entry.screen,
    label: entry.label,
    href: screenHref(entry.screen),
    active: entry.screen === current,
  }))

  // `<dialog>` の `close` はどの閉じ方（覆い・Esc・中から閉じる）でも届くので、≡ へ戻すのはここ1箇所。
  // 覆いを押した先は `<nav>` の中の `<dialog>` なので、中で開いていたキャラクターの選び口は自分では閉じない。ここで一緒に閉じる。
  function onCloseDrawer(): void {
    closeDrawer()
    character.close()
    drawerToggleRef.current?.focus()
  }

  return {
    current,
    parts: {
      character,
      sessionTag,
      gates,
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
      modelPermission,
      work,
      settings,
      onSelect: closeDrawer,
    },
    switcher,
    drawer: {
      open: drawerOpen,
      toggleRef: drawerToggleRef,
      onOpen: openDrawer,
      onClose: onCloseDrawer,
      tabs: TAB_ORDER.map((tab) => ({
        tab,
        label: tab === "tasks" && chatMode ? CHAT_TASKS_LABEL : TAB_LABELS[tab],
        selected: tab === drawerTab,
      })),
      tab: drawerTab,
      onSelectTab: selectTab,
      newSession: {
        disabled: turnInProgress,
        title: turnInProgress ? FRAME_ERROR_REASON.sessionSwitchDuringTurn : undefined,
        onStart: () => {
          if (turnInProgress) {
            return
          }
          closeDrawer()
          dispatch.session.startNewSession()
        },
      },
      face: drawerFace,
      onShowSettings: showSettings,
      onShowTabs: showTabs,
      screenGates: gates.filter((gate) => gate.screen !== "conversation"),
    },
    head,
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
