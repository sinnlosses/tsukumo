// 右下の入力欄の配線（送信・中断・経過時間・答え待ちの箱の表示切り替え）。**会話の内容（依頼の
// 文面）はブラウザから直接サーバへ POST するだけで、tsukumo のプロセス内の他のどこにも複製しない**
// （docs/coding-standards.md「会話内容の扱い」）。
//
// - **送信と中断は同時に押せる状態を作らない。** 送信ボタン1つを、`turnStatusPath` から届く
//   「進行中か」で「送信」／「中断」に切り替える。**押した瞬間に切り替えない**（サーバ側の駆動
//   イベントで実際にターンが始まった／終わったことが確認できてから切り替える）
// - **Command+Enter（`event.metaKey`）で送信、Enter 単独と Shift+Enter はどちらも既定動作の
//   改行のまま**（`preventDefault` しない。IME の変換確定の Command+Enter は送信にしない
//   （`event.isComposing` と、対応していない古いブラウザ向けの `keyCode === 229` の両方を見る）
// - **送信後は入力欄を空にしてフォーカスを残す。送信に失敗したら文字列は消さない**
// - **答え待ちの箱（`pendingAnswerPath`）は `pendingBox` の中身を丸ごと差し替える。** 気づける印は
//   2つ。(1) `pendingRegion` の `data-pending` 属性を "yes"/"no" に切り替え、許可モードの警告色とは
//   別の色で枠を目立たせる。(2) タブのタイトルの先頭に「● 」を付け、答え待ちが消えたら**最初に
//   読んだ元のタイトル**へ戻す（読むのは1回だけ）。ボタンを押したときの配線自体は
//   `pending-answer.ts` の {@link wirePendingAnswer} が持つ（ここでは呼ぶだけ）
// - **`/` コマンド補完（`command-suggestions.ts`）は同じ `<textarea>` の `keydown` を共有する。**
//   候補が開いている間は候補側の分岐で終え、閉じていれば今までどおり送信の判定に落ちる
// - **経過時間の表示（送信ボタンと同じ行）もここで配線する。** `turnStatusPath` の `update` から
//   届く `{ turnStartedAt, turnFinishedAt }`（`encodeTurnStatus` の JSON。`undefined` は `null`
//   で届く）をそのまま変数に持ち、`inProgress` もここから導く（`turnStartedAt` があって
//   `turnFinishedAt` が無ければ進行中）。**カウントアップはブラウザ側で1秒ごとに刻む**
//   （`Date.now()` を呼ぶのは副作用なので `src/view.ts` の純粋関数には置けない）。終了時刻が
//   あればそれを終点に固定し、ラベルを「経過」→「所要」に書き換える（60秒未満は `N秒`、
//   以降は `M分SS秒`）
//
// **送信ラベル・経過時間の既定ラベル・Command+Enter の記号は、`src/view.ts` が初期 HTML に
// 出したものをそのまま読む**（`sendButton.textContent` / `elapsedLabel.textContent` /
// `sendButton.dataset.shortcut`）。中断ラベル・所要ラベルは初期 HTML に出てこないので、
// `data-` 属性（{@link DispatchConfig}）で渡す。

import { createCommandSuggestions } from "./command-suggestions.ts"
import { wirePendingAnswer } from "./pending-answer.ts"

const DATA_PROMPT_PATH = "data-prompt-path"
const DATA_INTERRUPT_PATH = "data-interrupt-path"
const DATA_TURN_STATUS_PATH = "data-turn-status-path"
const DATA_PENDING_ANSWER_PATH = "data-pending-answer-path"
const DATA_ANSWER_PATH = "data-answer-path"
const DATA_COMMANDS_PATH = "data-commands-path"
const DATA_INTERRUPT_LABEL = "data-interrupt-label"
const DATA_FINISHED_LABEL = "data-finished-label"

export type DispatchElements = {
  readonly form: HTMLFormElement
  readonly textArea: HTMLTextAreaElement
  readonly sendButton: HTMLButtonElement
  readonly status: HTMLElement
  readonly pendingRegion: HTMLElement
  readonly pendingBox: HTMLElement
  readonly suggestionsBox: HTMLElement
  readonly elapsedLabel: HTMLElement
  readonly elapsedSpan: HTMLElement
}

export type DispatchConfig = {
  readonly promptPath: string
  readonly interruptPath: string
  readonly turnStatusPath: string
  readonly pendingAnswerPath: string
  readonly answerPath: string
  readonly commandsPath: string
  readonly interruptLabel: string
  readonly finishedLabel: string
}

/**
 * `document` から入力欄一式と、それに乗る経路・ラベル（`data-` 属性）を読んで
 * {@link bindDispatch} を呼ぶ。要素・属性のどれか1つでも見つからなければ何もしない。
 */
export function wireDispatch(): void {
  const region = document.querySelector<HTMLElement>(".layout-dispatch")
  const form = region?.querySelector("form")
  const textArea = region?.querySelector<HTMLTextAreaElement>(".dispatch-text")
  const sendButton = region?.querySelector<HTMLButtonElement>(".dispatch-send")
  const status = region?.querySelector<HTMLElement>(".dispatch-status")
  const pendingBox = region?.querySelector<HTMLElement>(".dispatch-pending")
  const suggestionsBox = region?.querySelector<HTMLElement>(".dispatch-suggestions")
  const elapsedLabel = region?.querySelector<HTMLElement>(".dispatch-elapsed-label")
  const elapsedSpan = region?.querySelector<HTMLElement>(".dispatch-elapsed")

  if (
    region === null ||
    region === undefined ||
    !(form instanceof HTMLFormElement) ||
    textArea === null ||
    textArea === undefined ||
    sendButton === null ||
    sendButton === undefined ||
    status === null ||
    status === undefined ||
    pendingBox === null ||
    pendingBox === undefined ||
    suggestionsBox === null ||
    suggestionsBox === undefined ||
    elapsedLabel === null ||
    elapsedLabel === undefined ||
    elapsedSpan === null ||
    elapsedSpan === undefined
  ) {
    return
  }

  const promptPath = region.getAttribute(DATA_PROMPT_PATH)
  const interruptPath = region.getAttribute(DATA_INTERRUPT_PATH)
  const turnStatusPath = region.getAttribute(DATA_TURN_STATUS_PATH)
  const pendingAnswerPath = region.getAttribute(DATA_PENDING_ANSWER_PATH)
  const answerPath = region.getAttribute(DATA_ANSWER_PATH)
  const commandsPath = region.getAttribute(DATA_COMMANDS_PATH)
  const interruptLabel = region.getAttribute(DATA_INTERRUPT_LABEL)
  const finishedLabel = region.getAttribute(DATA_FINISHED_LABEL)

  if (
    promptPath === null ||
    interruptPath === null ||
    turnStatusPath === null ||
    pendingAnswerPath === null ||
    answerPath === null ||
    commandsPath === null ||
    interruptLabel === null ||
    finishedLabel === null
  ) {
    return
  }

  bindDispatch(
    {
      form,
      textArea,
      sendButton,
      status,
      pendingRegion: region,
      pendingBox,
      suggestionsBox,
      elapsedLabel,
      elapsedSpan,
    },
    {
      promptPath,
      interruptPath,
      turnStatusPath,
      pendingAnswerPath,
      answerPath,
      commandsPath,
      interruptLabel,
      finishedLabel,
    },
  )
}

type TurnStatus = { readonly turnStartedAt: number | null; readonly turnFinishedAt: number | null }

/** 入力欄一式を配線する。 */
export function bindDispatch(elements: DispatchElements, config: DispatchConfig): void {
  const {
    form,
    textArea,
    sendButton,
    status,
    pendingRegion,
    pendingBox,
    suggestionsBox,
    elapsedLabel,
    elapsedSpan,
  } = elements

  // 送信ラベル・経過時間の既定ラベル・Command+Enter の記号は、初期 HTML に出ているものをそのまま
  // 使う（`src/view.ts` の `dispatchRegionHtml` が組み立てた値と二重に持たない）。
  const sendLabel = sendButton.textContent ?? ""
  const shortcutHint = sendButton.dataset.shortcut
  const elapsedIdleLabel = elapsedLabel.textContent ?? ""

  const originalTitle = document.title
  let inProgress = false
  let turnStartedAt: number | null = null
  let turnFinishedAt: number | null = null

  function applyButtonLabel(): void {
    sendButton.textContent = inProgress ? config.interruptLabel : sendLabel
    if (inProgress) {
      delete sendButton.dataset.shortcut
    } else if (shortcutHint !== undefined) {
      sendButton.dataset.shortcut = shortcutHint
    }
  }
  applyButtonLabel()

  function formatElapsed(totalSeconds: number): string {
    if (totalSeconds < 60) {
      return `${String(totalSeconds)}秒`
    }
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes)}分${String(seconds).padStart(2, "0")}秒`
  }

  function tickElapsed(): void {
    if (turnStartedAt === null) {
      elapsedSpan.textContent = "-"
      return
    }
    const endsAt = turnFinishedAt ?? Date.now()
    elapsedLabel.textContent = turnFinishedAt === null ? elapsedIdleLabel : config.finishedLabel
    const elapsedSeconds = Math.max(0, Math.floor((endsAt - turnStartedAt) / 1000))
    elapsedSpan.textContent = formatElapsed(elapsedSeconds)
  }
  tickElapsed()
  setInterval(tickElapsed, 1000)

  new EventSource(config.turnStatusPath).addEventListener(
    "update",
    (event: MessageEvent<string>) => {
      const turnStatus = parseTurnStatus(event.data)
      turnStartedAt = turnStatus.turnStartedAt
      turnFinishedAt = turnStatus.turnFinishedAt
      inProgress = turnStartedAt !== null && turnFinishedAt === null
      applyButtonLabel()
      tickElapsed()
    },
  )

  const suggestions = createCommandSuggestions(
    textArea,
    suggestionsBox,
    config.commandsPath,
    () => pendingRegion.dataset.pending === "yes",
  )

  new EventSource(config.pendingAnswerPath).addEventListener(
    "update",
    (event: MessageEvent<string>) => {
      const hasPending = event.data !== ""
      pendingBox.innerHTML = event.data
      pendingRegion.dataset.pending = hasPending ? "yes" : "no"
      document.title = hasPending ? `● ${originalTitle}` : originalTitle
      if (hasPending) {
        suggestions.close()
      }
    },
  )

  async function sendPrompt(text: string): Promise<void> {
    status.textContent = "送信中…"
    sendButton.disabled = true
    try {
      const response = await fetch(config.promptPath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      })
      const data: unknown = await response.json()
      if (isOkResult(data)) {
        textArea.value = ""
        suggestions.close()
        status.textContent = "送信済み"
      } else {
        status.textContent = `送信できなかった: ${reasonOf(data)}`
      }
    } catch {
      status.textContent = "送信できなかった"
    } finally {
      sendButton.disabled = false
      applyButtonLabel()
      textArea.focus()
    }
  }

  async function sendInterrupt(): Promise<void> {
    status.textContent = "中断中…"
    sendButton.disabled = true
    try {
      const response = await fetch(config.interruptPath, { method: "POST" })
      const data: unknown = await response.json()
      status.textContent = isOkResult(data) ? "中断した" : `中断できなかった: ${reasonOf(data)}`
    } catch {
      status.textContent = "中断できなかった"
    } finally {
      sendButton.disabled = false
      applyButtonLabel()
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault()
    if (inProgress) {
      return
    }
    const text = textArea.value.trim()
    if (text === "") {
      return
    }
    void sendPrompt(text)
  })

  sendButton.addEventListener("click", (event) => {
    if (inProgress) {
      event.preventDefault()
      void sendInterrupt()
    }
  })

  textArea.addEventListener("input", (event) => {
    // "input" は実際には InputEvent が届くが、lib.dom の HTMLElement 向けの型は素の Event
    // までしか持たないので、IME 判定に使う `isComposing` だけをここで取り出す。
    if ((event as InputEvent).isComposing) {
      return
    }
    suggestions.updateForCurrentValue()
  })

  textArea.addEventListener("keydown", (event) => {
    const composing = event.isComposing || event.keyCode === 229
    if (!composing && suggestions.hasMatches()) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        suggestions.moveSelection(1)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        suggestions.moveSelection(-1)
        return
      }
      if (event.key === "Tab") {
        event.preventDefault()
        suggestions.confirmSelected()
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        suggestions.confirmSelected()
        return
      }
      if (event.key === "Escape") {
        suggestions.close()
        return
      }
    }
    if (event.key !== "Enter" || composing || !event.metaKey) {
      return
    }
    event.preventDefault()
    if (!inProgress) {
      form.requestSubmit()
    }
  })

  wirePendingAnswer(pendingBox, config.answerPath)
}

/** `encodeTurnStatus`（`src/view.ts`）が組み立てた JSON を読む。壊れていれば「進行中でない」扱い。 */
function parseTurnStatus(raw: string): TurnStatus {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>
      const turnStartedAt = record["turnStartedAt"]
      const turnFinishedAt = record["turnFinishedAt"]
      return {
        turnStartedAt: typeof turnStartedAt === "number" ? turnStartedAt : null,
        turnFinishedAt: typeof turnFinishedAt === "number" ? turnFinishedAt : null,
      }
    }
  } catch {
    // 壊れた値は「進行中でない」扱いにする。
  }
  return { turnStartedAt: null, turnFinishedAt: null }
}

function isOkResult(value: unknown): boolean {
  return (
    typeof value === "object" && value !== null && (value as Record<string, unknown>)["ok"] === true
  )
}

function reasonOf(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const reason = (value as Record<string, unknown>)["reason"]
    if (typeof reason === "string") {
      return reason
    }
  }
  return ""
}
