// 脇の話を claude へ送る文面の包みと、transcript から包みを読み戻す決まり。
// 包みは claude が脇の話と分かる印で、入力の控え（`InputLedger`）の無い入力を組み直し（`toRestoredEvents`）が脇の話と見分ける手がかりでもある。

const ASIDE_OPEN = "<tsukumo-aside>"
const ASIDE_CLOSE = "</tsukumo-aside>"

const ASIDE_NOTE =
  "tsukumo の差し込み。委譲中に利用者が送った脇の話。`speak` を 1 回で答え、`report` は呼ばない"

/** 包みの全体。前後の空白だけを許し、包みの外に字があれば脇の話として読まない。 */
const ASIDE_PROMPT = /^<tsukumo-aside>\n?([\s\S]*?)\n?<\/tsukumo-aside>$/

export function asidePromptText(text: string): string {
  return `${ASIDE_OPEN}\n${ASIDE_NOTE}\n${text}\n${ASIDE_CLOSE}`
}

/** 包みの先頭の 1 行の説明は読み戻しで除く（説明の無い古い transcript も読める）。 */
export function asideTextOf(raw: string): string | undefined {
  const inner = ASIDE_PROMPT.exec(raw.trim())?.[1]
  return inner?.startsWith(`${ASIDE_NOTE}\n`) ? inner.slice(ASIDE_NOTE.length + 1) : inner
}
