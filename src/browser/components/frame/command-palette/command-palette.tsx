// コマンドパレット。
// 中身は開いている間だけ描くので、開き直すと探す欄と選びが初めに戻る。

import { Search } from "lucide-react"
import { useId, useState, type KeyboardEvent, type ReactElement } from "react"

import { Dialog } from "../../ui/dialog/dialog.tsx"
import { Surface } from "../../ui/surface/surface.tsx"
import styles from "./command-palette.module.css"
import {
  COMMAND_GROUP_LABEL,
  useCommandPaletteModel,
  type CommandGroup,
  type CommandPaletteModel,
  type PaletteCommand,
} from "./hooks/use-command-palette.ts"

const DIALOG_LABEL = "コマンドパレット"
const SEARCH_PLACEHOLDER = "操作や画面を探す"
const NO_MATCH = "当たる操作が無い"

const GROUP_ORDER = ["action", "screen"] as const satisfies readonly CommandGroup[]

type Choice = { readonly kind: "first" } | { readonly kind: "command"; readonly id: string }

const FIRST: Choice = { kind: "first" }

export function CommandPalette(): ReactElement {
  const model = useCommandPaletteModel()
  return (
    <Dialog
      open={model.open}
      ariaLabel={DIALOG_LABEL}
      backdrop="dim"
      placement={{ kind: "auto" }}
      onClose={model.onClose}
      className={styles["command-palette"]}
    >
      {model.open && <CommandPaletteBody model={model} />}
    </Dialog>
  )
}

function CommandPaletteBody(props: { readonly model: CommandPaletteModel }): ReactElement {
  const { model } = props
  const [query, setQuery] = useState("")
  const [choice, setChoice] = useState<Choice>(FIRST)
  const idPrefix = useId()
  const optionId = (id: string): string => `${idPrefix}-${id}`

  const rows = model.commands.filter((command) => matches(command, query))
  const selectable = rows.filter((command) => !command.disabled)
  const selected =
    selectable.find((command) => choice.kind === "command" && command.id === choice.id) ??
    selectable[0]
  const choose = (id: string): void => {
    setChoice({ kind: "command", id })
  }

  function move(step: number): void {
    const index = selectable.findIndex((command) => command.id === selected?.id)
    const next = selectable[Math.min(Math.max(index + step, 0), selectable.length - 1)]
    if (next !== undefined) {
      choose(next.id)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) {
      return
    }
    if (event.key === "ArrowDown" || (event.ctrlKey && !event.metaKey && event.key === "n")) {
      event.preventDefault()
      move(1)
    }
    if (event.key === "ArrowUp" || (event.ctrlKey && !event.metaKey && event.key === "p")) {
      event.preventDefault()
      move(-1)
    }
    if (event.key === "Enter" && selected !== undefined) {
      event.preventDefault()
      model.onRun(selected)
    }
  }

  return (
    <Surface
      element="div"
      tone="surface"
      space="none"
      radius="xl"
      shadow="none"
      className={styles["command-palette-frame"]}
    >
      <div className={styles["command-palette-search"]}>
        <Search size={16} strokeWidth={2} aria-hidden="true" />
        <input
          type="search"
          className={styles["command-palette-input"]}
          aria-label="操作を探す"
          placeholder={SEARCH_PLACEHOLDER}
          value={query}
          role="combobox"
          aria-expanded={true}
          aria-controls={`${idPrefix}-list`}
          aria-activedescendant={selected === undefined ? undefined : optionId(selected.id)}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value)
            setChoice(FIRST)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <div
        id={`${idPrefix}-list`}
        role="listbox"
        aria-label="操作"
        className={styles["command-palette-list"]}
      >
        {rows.length === 0 && <p className={styles["command-palette-empty"]}>{NO_MATCH}</p>}
        {GROUP_ORDER.map((group) => {
          const groupRows = rows.filter((command) => command.group === group)
          return (
            groupRows.length > 0 && (
              <div key={group} role="group" aria-label={COMMAND_GROUP_LABEL[group]}>
                <div className={styles["command-palette-group-label"]} aria-hidden="true">
                  {COMMAND_GROUP_LABEL[group]}
                </div>
                {groupRows.map((command) => (
                  <div
                    key={command.id}
                    id={optionId(command.id)}
                    role="option"
                    aria-selected={command.id === selected?.id}
                    aria-disabled={command.disabled}
                    title={command.title}
                    className={styles["command-palette-row"]}
                    onPointerMove={() => {
                      if (!command.disabled) {
                        choose(command.id)
                      }
                    }}
                    onClick={() => {
                      model.onRun(command)
                    }}
                  >
                    <span className={styles["command-palette-label"]}>{command.label}</span>
                    {command.keyLabel !== undefined && (
                      <kbd className={styles["command-palette-key"]}>{command.keyLabel}</kbd>
                    )}
                  </div>
                ))}
              </div>
            )
          )
        })}
      </div>
    </Surface>
  )
}

function matches(command: PaletteCommand, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return needle === "" || command.label.toLowerCase().includes(needle)
}
