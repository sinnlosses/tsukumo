// コマンドパレット。

import type { ReactElement } from "react"
import { sortBy } from "remeda"

import {
  CommandPalette as PalettePanel,
  type CommandPaletteRow,
} from "../../ui/command-palette/command-palette.tsx"
import {
  COMMAND_GROUP_LABEL,
  useCommandPaletteModel,
  type CommandGroup,
} from "./hooks/use-command-palette.ts"

const DIALOG_LABEL = "コマンドパレット"
const SEARCH_LABEL = "操作を探す"
const SEARCH_PLACEHOLDER = "操作や画面を探す"
const NO_MATCH = "当たる操作が無い"

const GROUP_ORDER = ["action", "screen", "setting"] as const satisfies readonly CommandGroup[]

export function CommandPalette(): ReactElement {
  const model = useCommandPaletteModel()
  const commands = sortBy(model.commands, (command) => GROUP_ORDER.indexOf(command.group))
  const rows = commands.map((command): CommandPaletteRow => ({
    id: command.id,
    label: command.label,
    group: COMMAND_GROUP_LABEL[command.group],
    ...(command.keys === undefined ? {} : { keys: command.keys }),
    ...(command.hint === undefined ? {} : { hint: command.hint }),
    // 設定の項目は数が多いので、何か打つまでは並べない。
    hiddenUntilTyped: command.group === "setting",
  }))

  return (
    <PalettePanel
      open={model.open}
      ariaLabel={DIALOG_LABEL}
      placeholder={SEARCH_PLACEHOLDER}
      searchLabel={SEARCH_LABEL}
      emptyText={NO_MATCH}
      rows={rows}
      onClose={model.onClose}
      onRun={(id) => {
        const command = commands.find((candidate) => candidate.id === id)
        if (command !== undefined) {
          model.onRun(command)
        }
      }}
    />
  )
}
