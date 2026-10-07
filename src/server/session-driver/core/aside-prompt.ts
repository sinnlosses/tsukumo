// 脇の話を claude へ送る文面の包みと、transcript から包みを読み戻す決まり。
// 包みは claude が脇の話と分かる印で、組み直し（`toRestoredEvents`）が脇の話を見分ける唯一の手がかりでもある。

const ASIDE_OPEN = "<tsukumo-aside>"
const ASIDE_CLOSE = "</tsukumo-aside>"

/** 包みの全体。前後の空白だけを許し、包みの外に字があれば脇の話として読まない。 */
const ASIDE_PROMPT = /^<tsukumo-aside>\n?([\s\S]*?)\n?<\/tsukumo-aside>$/

export function asidePromptText(text: string): string {
  return `${ASIDE_OPEN}\n${text}\n${ASIDE_CLOSE}`
}

export function asideTextOf(raw: string): string | undefined {
  return ASIDE_PROMPT.exec(raw.trim())?.[1]
}
