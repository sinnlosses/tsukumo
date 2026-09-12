// 入力欄の `/` コマンド補完。**入力の先頭が `/` で、まだ空白が無いときだけ**候補を出す
// （docs/requirements.md 4.2「入力欄」）。候補は `commandsPath` から取りに行き、0件でない結果は
// セッション中キャッシュする。
//
// - **0件を掴んだときはキャッシュせず、次に候補を出そうとしたときに取り直す。** 最初の依頼を
//   送る前は `GET /api/commands` が0件を返すことがある（`init` がまだ届いていないため）。
//   ここを永久キャッシュすると、依頼を送って候補が用意できたあとも、そのタブでは空のまま
//   固定されてリロードするまで戻らない（2026-09-12 に見つかった不具合）
// - **前方一致を先に、続けて部分一致を出す。各グループの中はアルファベット順で、合計最大
//   {@link MAX_COMMAND_SUGGESTIONS} 件**（Claude Code の TUI の絞り方に合わせた）
// - **答え待ちの箱がある間は出さない**（`isPendingActive` が真を返す間）
// - キー操作（上下・Tab・Enter・Esc）の配線は呼び出し側（`dispatch.ts`）の `keydown` リスナーが
//   持つ（送信の Enter と同じリスナーを共有するため）。マウスでの確定（`<li>` の `mousedown`）は
//   送信と競合しないので、ここで直接配線する
// - **候補の文字列は `escapeCommandLabel` を通してから組み立てる**（コマンド名も説明も SDK が
//   返す外部由来の値なので、HTML として解釈されない形にする）

const MAX_COMMAND_SUGGESTIONS = 10
const ITEM_CLASS = "dispatch-suggestion-item"
const NAME_CLASS = "dispatch-suggestion-name"
const DESCRIPTION_CLASS = "dispatch-suggestion-description"

export type CommandDescription = { readonly name: string; readonly description: string | undefined }

export type CommandSuggestions = {
  /** 候補が1件以上出ているか（`dispatch.ts` の keydown がここで分岐するかを決める）。 */
  readonly hasMatches: () => boolean
  readonly moveSelection: (delta: number) => void
  /** 引数を省くと、いま選ばれている候補を確定する。 */
  readonly confirmSelected: (index?: number) => void
  readonly close: () => void
  /** `textArea.value` の今の値に応じて候補を出し直す（`input` イベントから呼ぶ）。 */
  readonly updateForCurrentValue: () => void
}

/**
 * `/` 補完のコントローラを作る。`textArea` に候補を書き戻し、`suggestionsBox` に一覧を描く。
 * `isPendingActive` は答え待ちの箱が出ているかどうかを聞くコールバック（`dispatch.ts` が持つ状態）。
 */
export function createCommandSuggestions(
  textArea: HTMLTextAreaElement,
  suggestionsBox: HTMLElement,
  commandsPath: string,
  isPendingActive: () => boolean,
): CommandSuggestions {
  let allCommandsPromise: Promise<readonly CommandDescription[]> | undefined = undefined
  let matches: readonly CommandDescription[] = []
  let selectedIndex = -1

  function loadCommands(): Promise<readonly CommandDescription[]> {
    if (allCommandsPromise === undefined) {
      allCommandsPromise = fetch(commandsPath)
        .then((response) => response.json())
        .then((data: unknown) => parseCommands(data))
        .catch(() => [])
        .then((commands) => {
          // 0件は「まだ用意できていない」としてキャッシュせず、次回また取りに行く
          // （最初の依頼を送る前は 0件が正当な応答なので、リロードせずに回復させる）。
          if (commands.length === 0) {
            allCommandsPromise = undefined
          }
          return commands
        })
    }
    return allCommandsPromise
  }

  function shouldShow(value: string): boolean {
    return value.startsWith("/") && !containsWhitespace(value) && !isPendingActive()
  }

  function render(next: readonly CommandDescription[]): void {
    matches = next
    selectedIndex = next.length === 0 ? -1 : 0
    if (next.length === 0) {
      suggestionsBox.hidden = true
      suggestionsBox.innerHTML = ""
      return
    }
    suggestionsBox.innerHTML = next
      .map((command, index) => suggestionItemHtml(command, index))
      .join("")
    suggestionsBox.hidden = false
  }

  function close(): void {
    matches = []
    selectedIndex = -1
    suggestionsBox.hidden = true
    suggestionsBox.innerHTML = ""
  }

  function moveSelection(delta: number): void {
    if (matches.length === 0) {
      return
    }
    selectedIndex = (selectedIndex + delta + matches.length) % matches.length
    const items = suggestionsBox.querySelectorAll<HTMLElement>(`.${ITEM_CLASS}`)
    for (let index = 0; index < items.length; index += 1) {
      items[index]?.classList.toggle("is-selected", index === selectedIndex)
    }
    const selected = items[selectedIndex]
    if (selected !== undefined && typeof selected.scrollIntoView === "function") {
      selected.scrollIntoView({ block: "nearest" })
    }
  }

  function confirmSelected(index: number = selectedIndex): void {
    const command = matches[index]
    if (command === undefined) {
      return
    }
    textArea.value = `/${command.name} `
    close()
    textArea.focus()
  }

  function updateForCurrentValue(): void {
    const value = textArea.value
    if (!shouldShow(value)) {
      close()
      return
    }
    loadCommands()
      .then((commands) => {
        // fetch を待つ間に入力が変わっていたら、そのときの値で判定し直す。
        if (!shouldShow(textArea.value)) {
          return
        }
        render(matchingCommands(commands, textArea.value))
      })
      .catch(() => {})
  }

  // マウスでの確定。mousedown の既定動作（フォーカス移動）を preventDefault で止め、textarea に
  // フォーカスを残す。押した項目の data-index で、キーボードの選択位置とは独立に確定する。
  suggestionsBox.addEventListener("mousedown", (event) => {
    const target = event.target as Element | null
    if (target === null) {
      return
    }
    const item = target.closest<HTMLElement>(`.${ITEM_CLASS}`)
    if (item === null) {
      return
    }
    event.preventDefault()
    confirmSelected(Number(item.dataset.index))
  })

  return {
    hasMatches: () => matches.length > 0,
    moveSelection,
    confirmSelected,
    close,
    updateForCurrentValue,
  }
}

function containsWhitespace(text: string): boolean {
  return /\s/.test(text)
}

function byName(left: CommandDescription, right: CommandDescription): number {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
}

function matchingCommands(
  commands: readonly CommandDescription[],
  value: string,
): readonly CommandDescription[] {
  const prefix = value.slice(1)
  const prefixMatches = commands
    .filter((command) => command.name.startsWith(prefix))
    .toSorted(byName)
  const partialMatches = commands
    .filter((command) => !command.name.startsWith(prefix) && command.name.includes(prefix))
    .toSorted(byName)
  return [...prefixMatches, ...partialMatches].slice(0, MAX_COMMAND_SUGGESTIONS)
}

function escapeCommandLabel(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function suggestionItemHtml(command: CommandDescription, index: number): string {
  const descriptionHtml =
    command.description === undefined || command.description === ""
      ? ""
      : `<span class="${DESCRIPTION_CLASS}">${escapeCommandLabel(command.description)}</span>`
  return (
    `<li class="${ITEM_CLASS}${index === 0 ? " is-selected" : ""}" data-index="${String(index)}">` +
    `<span class="${NAME_CLASS}">/${escapeCommandLabel(command.name)}</span>${descriptionHtml}</li>`
  )
}

/** `GET /api/commands` の応答（`{ commands: [...] }`）を検証しながら読む。壊れていれば空配列。 */
function parseCommands(data: unknown): readonly CommandDescription[] {
  if (typeof data !== "object" || data === null) {
    return []
  }
  const commands = (data as Record<string, unknown>)["commands"]
  if (!Array.isArray(commands)) {
    return []
  }
  const result: CommandDescription[] = []
  for (const command of commands) {
    if (typeof command !== "object" || command === null) {
      continue
    }
    const name = (command as Record<string, unknown>)["name"]
    if (typeof name !== "string") {
      continue
    }
    const description = (command as Record<string, unknown>)["description"]
    result.push({ name, description: typeof description === "string" ? description : undefined })
  }
  return result
}
