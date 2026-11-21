// コマンドパレットの中身（操作と画面の行）と、画面全体のショートカットの受け口。

import { useState } from "react"

import { SETTING_ENTRIES, SETTING_FACE_LABEL } from "../../../../domain/setting-entry.ts"
import { isOverlayOpen } from "../../../../hooks/open-overlay.ts"
import { useEventListener } from "../../../../hooks/use-event-listener.ts"
import { useComposerFocus } from "../../../../stores/composer-focus.ts"
import { useLayoutSplitReset } from "../../../../stores/layout-split-reset.ts"
import { SCREEN_NAV_ITEMS, type NavScreen, type Screen } from "../../../../stores/location-hash.ts"
import { navigateTo, useScreen } from "../../../../stores/screen.tsx"
import { useSessionSwitcherRequest } from "../../../../stores/session-switcher-request.ts"
import { useRestartRefused, useSession } from "../../../../stores/session.ts"
import { useSettingsRequest } from "../../../../stores/settings-request.ts"
import { useTaskBoardRequest } from "../../../../stores/task-board-request.ts"
import { nowEpochMilliseconds } from "../../../../utils/clock.ts"
import { SHORTCUT_KEYS, shortcutOf, type Shortcut } from "../domain/shortcut-key.ts"

export type CommandGroup = "action" | "screen" | "setting"

export type PaletteCommand = {
  readonly id: string
  readonly label: string
  /** 名前の横に添える行き先（設定の項目の「設定 › ページ名」）。 */
  readonly hint?: string
  readonly group: CommandGroup
  /** `Kbd` の `keys`（`mod+k` のように `+` で区切る）。 */
  readonly keys?: string
  readonly run: () => void
}

export type CommandPaletteModel = {
  readonly open: boolean
  readonly onClose: () => void
  readonly commands: readonly PaletteCommand[]
  /** パレットを閉じてから操作を呼ぶ。 */
  readonly onRun: (command: PaletteCommand) => void
}

export const COMMAND_GROUP_LABEL = {
  action: "操作",
  screen: "画面へ移る",
  setting: "設定の項目",
} satisfies Record<CommandGroup, string>

const SCREEN_COMMAND_LABEL = {
  conversation: "会話",
  character: "キャラクター",
  "token-usage": "トークンの使用量",
  achievement: "成果",
} satisfies Record<NavScreen, string>

export function useCommandPaletteModel(): CommandPaletteModel {
  const [open, setOpen] = useState(false)
  const close = (): void => {
    setOpen(false)
  }
  const actions = useShortcutActions()
  const screen = useScreen()
  const chatMode = useSession((session) => session.state.chatMode)
  const dispatch = useSession((session) => session.dispatch)
  const restartRefused = useRestartRefused()
  const requestSplitReset = useLayoutSplitReset((state) => state.requestReset)
  const openSettings = useSettingsRequest((state) => state.openSettings)

  useEventListener(document, "keydown", (event) => {
    const shortcut = shortcutOf({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing,
      target: event.target ?? undefined,
    })
    if (shortcut === "none" || (isOverlayOpen() && !open)) {
      return
    }
    event.preventDefault()
    if (shortcut === "command-palette") {
      setOpen(!open)
      return
    }
    close()
    actions[shortcut]()
  })

  function goToConversation(chat: boolean): void {
    navigateTo("conversation")
    if (chat !== chatMode && !restartRefused) {
      void dispatch.session.setChatMode({ chat })
    }
  }

  const allCommands: readonly PaletteCommand[] = [
    actionCommand("composer", "入力欄へ移る", actions.composer),
    actionCommand("session-switcher", "セッションを切り替える", actions["session-switcher"]),
    {
      id: "new-session",
      label: "新しいセッションを始める",
      group: "action",
      run: () => {
        void dispatch.session.startNewSession()
      },
    },
    actionCommand("task-board", "タスクの一覧モードを開く", actions["task-board"]),
    actionCommand("settings", "設定を開く", actions.settings),
    {
      id: "reset-split",
      label: "比率を既定に戻す",
      group: "action",
      run: requestSplitReset,
    },
    ...[false, true].map((chat): PaletteCommand => ({
      id: chat ? "screen-chat" : "screen-work",
      label: chat ? "雑談" : "仕事",
      group: "screen",
      run: () => {
        goToConversation(chat)
      },
    })),
    ...SETTING_ENTRIES.map((entry): PaletteCommand => ({
      id: `setting-${entry.itemKey}`,
      label: entry.label,
      hint: `設定 › ${SETTING_FACE_LABEL[entry.faceKey]}`,
      group: "setting",
      run: () => {
        openSettings({ faceKey: entry.faceKey, itemKey: entry.itemKey })
      },
    })),
    ...SCREEN_NAV_ITEMS.filter((item) => item.screen !== "conversation").map(
      (item): PaletteCommand => ({
        id: `screen-${item.screen}`,
        label: SCREEN_COMMAND_LABEL[item.screen],
        group: "screen",
        run: () => {
          navigateTo(item.screen)
        },
      }),
    ),
  ]

  return {
    open,
    onClose: close,
    commands: allCommands.filter(
      (command) =>
        !isHiddenOn(command.id, screen, chatMode) &&
        !isRefusedDuringTurn(command.id, chatMode, restartRefused),
    ),
    onRun: (command) => {
      close()
      command.run()
    },
  }
}

/** ショートカットを持つ操作の実体。会話の画面にしか無い面（入力欄・タスクのモーダル）は、会話の画面へ移ってから開く。 */
function useShortcutActions(): Record<Exclude<Shortcut, "command-palette">, () => void> {
  const requestFocus = useComposerFocus((state) => state.requestFocus)
  const openSwitcher = useSessionSwitcherRequest((state) => state.openSwitcher)
  const openList = useTaskBoardRequest((state) => state.openList)
  const openSettings = useSettingsRequest((state) => state.openSettings)
  function onComposer(): void {
    navigateTo("conversation")
    requestFocus()
  }
  function onSessionSwitcher(): void {
    openSwitcher(nowEpochMilliseconds())
  }
  function onTaskBoard(): void {
    navigateTo("conversation")
    openList("")
  }
  return {
    composer: onComposer,
    "session-switcher": onSessionSwitcher,
    "task-board": onTaskBoard,
    settings: openSettings,
  }
}

function actionCommand(
  shortcut: Exclude<Shortcut, "command-palette">,
  label: string,
  run: () => void,
): PaletteCommand {
  return {
    id: shortcut,
    label,
    group: "action",
    keys: SHORTCUT_KEYS[shortcut],
    run,
  }
}

// ターンの進行中で起こし直せないあいだ、新しいセッションと、いまと違うモードの会話の行を出さない。
function isRefusedDuringTurn(id: string, chatMode: boolean, restartRefused: boolean): boolean {
  if (!restartRefused) {
    return false
  }
  return id === "new-session" || id === (chatMode ? "screen-work" : "screen-chat")
}

// 今いる画面へ移る行と、仕切りの無い画面での比率を戻す行を隠す。
function isHiddenOn(id: string, screen: Screen, chatMode: boolean): boolean {
  if (id === "reset-split") {
    return screen !== "conversation"
  }
  if (screen === "conversation") {
    return id === (chatMode ? "screen-chat" : "screen-work")
  }
  return id === `screen-${screen}`
}
