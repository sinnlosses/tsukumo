// 答え待ちの箱（許可要求・質問）の配線。入力欄の上の箱の要素に対するイベント委譲だけで書く
// （箱の中身は SSE で丸ごと差し替わるため、個々のボタンに直接リスナーを付けても差し替えの
// たびに失われる。`main-turns.ts` と同じ理由）。
//
// - **押した瞬間に無効化し、二重送信を防ぐ。** 失敗したら押せる状態に戻す
// - **単一選択（質問が1つだけで単一選択）は選択肢を押した瞬間に送る。** それ以外は選択・入力を
//   ブラウザ側に溜め、全部答えてから「答える」ボタンで送る
// - **`multiSelect` は選んだ選択肢を「、」でつないだ1つの文字列にする**（`answersRecord` は
//   1問につき1つの文字列しか受け取らない。`src/pending-answer.ts`）

// `src/view.ts` が答え待ちの箱の HTML に付ける、クラス名（構造上の取り決め。
// `region-subscription.ts` の `data-event-path` と同じ理由で、値ではなく名前を両側で持つ）。
// 答え待ちの id は同じ要素の `data-pending-id` 属性（`dataset.pendingId`）で運ぶ。
const PENDING_ANSWER_ELEMENT_CLASS = "pending-answer"

type Answer =
  | { readonly kind: "allow" }
  | { readonly kind: "deny" }
  | { readonly kind: "answers"; readonly labels: readonly string[] }

/** 答え待ちの箱（`#tsukumo-dispatch-pending`）の配線を行う。`answerPath` は `ANSWER_PATH`。 */
export function wirePendingAnswer(el: Element, answerPath: string): void {
  const box = (): Element | null => el.querySelector(`.${PENDING_ANSWER_ELEMENT_CLASS}`)
  const totalQuestions = (): number => el.querySelectorAll(".question-card").length

  const answerFor = (index: number): string => {
    const card = el.querySelector<HTMLElement>(
      `.question-card[data-question-index="${String(index)}"]`,
    )
    if (card === null) {
      return ""
    }
    if (card.dataset.multiSelect === "true") {
      const labels = [
        ...card.querySelectorAll<HTMLElement>(".question-option-button.is-selected"),
      ].map((button) => button.dataset.label ?? "")
      const other = card.querySelector<HTMLInputElement>(".question-other-input")
      const otherValue = other === null ? "" : other.value.trim()
      if (otherValue !== "") {
        labels.push(otherValue)
      }
      return labels.join("、")
    }
    const selected = card.querySelector<HTMLElement>(".question-option-button.is-selected")
    if (selected !== null) {
      return selected.dataset.label ?? ""
    }
    const other = card.querySelector<HTMLInputElement>(".question-other-input")
    return other === null ? "" : other.value.trim()
  }

  const updateSubmitState = (): void => {
    const submit = el.querySelector<HTMLButtonElement>(".pending-answer-submit")
    if (submit === null) {
      return
    }
    let allAnswered = true
    for (let index = 0; index < totalQuestions(); index += 1) {
      if (answerFor(index) === "") {
        allAnswered = false
        break
      }
    }
    submit.disabled = !allAnswered
  }

  const setStatus = (text: string): void => {
    const status = el.querySelector<HTMLElement>(".pending-status")
    if (status !== null) {
      status.textContent = text
    }
  }

  const lockPending = (locked: boolean): void => {
    for (const control of el.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      ".pending-action, .question-option-button, .question-other-send, .question-other-input",
    )) {
      control.disabled = locked
    }
  }

  const sendAnswer = (answer: Answer): void => {
    const pendingBox = box()
    const id = pendingBox === null ? "" : ((pendingBox as HTMLElement).dataset.pendingId ?? "")
    lockPending(true)
    setStatus("送信中…")
    fetch(answerPath, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, answer }),
    })
      .then((response) => response.json())
      .then((result: unknown) => {
        if (isOkResult(result)) {
          setStatus("送った")
          return
        }
        lockPending(false)
        setStatus(`送れなかった: ${reasonOf(result)}`)
      })
      .catch(() => {
        lockPending(false)
        setStatus("送れなかった")
      })
  }

  el.addEventListener("click", (event) => {
    const target = event.target as Element | null
    if (target === null) {
      return
    }

    const permissionButton = target.closest<HTMLElement>(".pending-permission .pending-action")
    if (permissionButton !== null) {
      const answer = parseAnswerAttribute(permissionButton.dataset.answer)
      if (answer !== undefined) {
        sendAnswer(answer)
      }
      return
    }

    const optionButton = target.closest<HTMLElement>(".question-option-button")
    if (optionButton !== null) {
      const card = optionButton.closest<HTMLElement>(".question-card")
      if (card === null) {
        return
      }
      for (const sibling of card.querySelectorAll<HTMLElement>(".question-option-button")) {
        sibling.classList.toggle("is-selected", sibling === optionButton)
      }
      if (totalQuestions() === 1 && card.dataset.multiSelect !== "true") {
        sendAnswer({ kind: "answers", labels: [optionButton.dataset.label ?? ""] })
        return
      }
      updateSubmitState()
      return
    }

    const otherSend = target.closest<HTMLElement>(".question-other-send")
    if (otherSend !== null) {
      const card = otherSend.closest<HTMLElement>(".question-card")
      const input = card?.querySelector<HTMLInputElement>(".question-other-input")
      const value = input === null || input === undefined ? "" : input.value.trim()
      if (value === "" || card === null) {
        return
      }
      if (totalQuestions() === 1 && card.dataset.multiSelect !== "true") {
        sendAnswer({ kind: "answers", labels: [value] })
        return
      }
      updateSubmitState()
      return
    }

    const submit = target.closest<HTMLElement>(".pending-answer-submit")
    if (submit !== null) {
      const labels: string[] = []
      for (let index = 0; index < totalQuestions(); index += 1) {
        labels.push(answerFor(index))
      }
      sendAnswer({ kind: "answers", labels })
    }
  })

  el.addEventListener("input", (event) => {
    const target = event.target as Element | null
    if (target !== null && target.classList.contains("question-other-input")) {
      updateSubmitState()
    }
  })

  updateSubmitState()
}

/** `data-answer` 属性（`src/view.ts` が JSON で埋め込む `{kind:"allow"}` / `{kind:"deny"}`）を読む。 */
function parseAnswerAttribute(raw: string | undefined): Answer | undefined {
  if (raw === undefined) {
    return undefined
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === "object" && value !== null) {
      const kind = (value as Record<string, unknown>)["kind"]
      if (kind === "allow" || kind === "deny") {
        return { kind }
      }
    }
  } catch {
    // 壊れた値は無視する（view.ts が組み立てる値なので通常は起きない）。
  }
  return undefined
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
