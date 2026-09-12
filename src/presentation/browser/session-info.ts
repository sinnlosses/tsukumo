// サイドバーのセッション情報（モデル・許可モードの `<select>`）の配線。サイドバーの要素に対する
// イベント委譲で書く（`pending-answer.ts` と同じ理由。`<select>` は push のたびに差し替わる）。
//
// **許可モード・モデルの変更は `change` の瞬間に送る。** 次に届く `session-info` で `<select>`
// の選択が上書きされる（サーバ側の値が正になる）。

const DATA_PERMISSION_MODE_PATH = "data-permission-mode-path"
const DATA_MODEL_PATH = "data-model-path"

/**
 * `document` から `.layout-sidebar` と、そこに乗る経路（`data-permission-mode-path` /
 * `data-model-path`）を読んで {@link bindSessionInfo} を呼ぶ。見つからなければ何もしない。
 */
export function wireSessionInfo(): void {
  const element = document.querySelector(".layout-sidebar")
  if (element === null) {
    return
  }
  const permissionModePath = element.getAttribute(DATA_PERMISSION_MODE_PATH)
  const modelPath = element.getAttribute(DATA_MODEL_PATH)
  if (permissionModePath === null || modelPath === null) {
    return
  }
  bindSessionInfo(element, { permissionModePath, modelPath })
}

export type SessionInfoConfig = {
  readonly permissionModePath: string
  readonly modelPath: string
}

/** サイドバーの `<select class="permission-mode-select">` / `<select class="model-select">` を配線する。 */
export function bindSessionInfo(el: Element, config: SessionInfoConfig): void {
  function wireSelect(
    selectClass: string,
    statusClass: string,
    path: string,
    bodyOf: (value: string) => Record<string, string>,
  ): void {
    el.addEventListener("change", (event) => {
      const target = event.target
      if (!(target instanceof HTMLSelectElement) || !target.classList.contains(selectClass)) {
        return
      }
      const status = el.querySelector<HTMLElement>(`.${statusClass}`)
      target.disabled = true
      if (status !== null) {
        status.textContent = "切り替え中…"
      }
      fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyOf(target.value)),
      })
        .then((response) => response.json())
        .then((result: unknown) => {
          target.disabled = false
          if (status !== null) {
            status.textContent = isOkResult(result)
              ? ""
              : `切り替えられなかった: ${reasonOf(result)}`
          }
        })
        .catch(() => {
          target.disabled = false
          if (status !== null) {
            status.textContent = "切り替えられなかった"
          }
        })
    })
  }

  wireSelect(
    "permission-mode-select",
    "permission-mode-status",
    config.permissionModePath,
    (mode) => ({
      mode,
    }),
  )
  wireSelect("model-select", "model-select-status", config.modelPath, (model) => ({ model }))
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
