// 探す（⌘K）のロジック。開閉と打った字を持ち、出どころごとの項目を集めて絞る。
// ⌘K（Windows などでは Ctrl+K）はどこにフォーカスがあっても開閉する。開閉は URL に載せない。
//
// 出どころは3つ。画面（重ねる紙の5枚・仕事と雑談の切り替え・セッションの切り替え）、頼めるタスク（タスクの一覧）、
// コマンド（入力欄の `/` 補完と同じ候補）。
// タスクとコマンドは依頼として送るので、ターンが動いているあいだは載せない（送っても断られる）。

import { useState } from "react"
import { entries as entriesOf } from "remeda"

import { commandSuggestions } from "../../../../../shared/session/command-suggestion.ts"
import { taskStartRequest } from "../../../../features/task-board/task-request.ts"
import { useEventListener } from "../../../../hooks/use-event-listener.ts"
import { SHEET_TITLES } from "../../../../stores/location-hash.ts"
import { navigateTo } from "../../../../stores/screen.tsx"
import { useSession, useTurnRunning } from "../../../../stores/session.ts"
import { matchingSearchEntries, type SearchEntry } from "../domain/search-entry.ts"

/** 探すの材料のうち、部屋の頭と分け合うもの。 */
export type SearchSources = {
  readonly chatMode: boolean
  readonly onChangeMode: (chat: boolean) => void
  readonly onOpenSessions: () => void
}

export type SearchPaletteView = {
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
  readonly query: string
  readonly onQueryChange: (query: string) => void
  /** 字で絞った項目（群の順）。 */
  readonly entries: readonly SearchEntry[]
  readonly onSelect: (key: string) => void
}

const REQUEST_HINT = "↩ で頼む"

export function useSearchPalette(sources: SearchSources): SearchPaletteView {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const dispatch = useSession((session) => session.dispatch)
  const tasks = useSession((session) => session.state.tasks)
  const slashCommands = useSession((session) => session.state.slashCommands)
  const commandDescriptions = useSession((session) => session.state.commandDescriptions)
  const turnRunning = useTurnRunning()

  const show = (): void => {
    setQuery("")
    setOpen(true)
  }
  const close = (): void => {
    setOpen(false)
  }
  const request = (text: string): void => {
    navigateTo("conversation")
    void dispatch.session.prompt({ text, images: [] })
  }

  useEventListener(document, "keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault()
      if (open) {
        close()
      } else {
        show()
      }
    }
  })

  const screenEntries = entriesOf(SHEET_TITLES)
    .filter(([screen]) => screen !== "tasks" || tasks.kind !== "no-beads")
    .map(([screen, label]): SearchEntry => ({
      key: `screen:${screen}`,
      group: "移る",
      label,
      hint: "",
      run: () => navigateTo(screen),
    }))
  const moveEntries: readonly SearchEntry[] = [
    ...screenEntries,
    {
      key: "mode",
      group: "移る",
      label: sources.chatMode ? "仕事に戻る" : "雑談に切り替える",
      hint: "",
      run: () => sources.onChangeMode(!sources.chatMode),
    },
    {
      key: "sessions",
      group: "移る",
      label: "セッションを切り替える",
      hint: "",
      run: sources.onOpenSessions,
    },
  ]
  const taskEntries: readonly SearchEntry[] =
    turnRunning || tasks.kind !== "known"
      ? []
      : tasks.items.flatMap((task): readonly SearchEntry[] => {
          const start = taskStartRequest(task)
          return start.kind === "not-requestable"
            ? []
            : [
                {
                  key: `task:${task.id}`,
                  group: "タスクを頼む",
                  label: `${task.id} ${task.summary}`,
                  hint: REQUEST_HINT,
                  run: () => request(start.prompt),
                },
              ]
        })
  const commandEntries: readonly SearchEntry[] = turnRunning
    ? []
    : commandSuggestions(slashCommands, commandDescriptions).map((command) => ({
        key: `command:${command.name}`,
        group: "コマンド",
        label: `/${command.name}`,
        hint: command.description ?? "",
        run: () => request(`/${command.name}`),
      }))
  const entries = matchingSearchEntries([...moveEntries, ...taskEntries, ...commandEntries], query)

  return {
    open,
    onOpen: show,
    onClose: close,
    query,
    onQueryChange: setQuery,
    entries,
    onSelect: (key) => {
      const entry = entries.find((each) => each.key === key)
      close()
      entry?.run()
    },
  }
}
