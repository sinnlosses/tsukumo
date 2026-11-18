// 書き出すファイルの名前。`tsukumo-report-<タスクID か題>-<YYYYMMDD>-<HHmm>.html`。同じ名前があれば `-2` から足す。

const MAX_TITLE_LENGTH = 24
const FALLBACK_TITLE = "session"

export type ReportExportFileNameInput = {
  readonly taskId?: string
  readonly sessionTitle: string
  /** 利用者のローカル時刻。 */
  readonly now: Temporal.PlainDateTime
  readonly existingNames: ReadonlySet<string>
}

export function reportExportFileName(input: ReportExportFileNameInput): string {
  const label = fileSafe(input.taskId ?? "") || fileSafe(input.sessionTitle) || FALLBACK_TITLE
  const base = `tsukumo-report-${label}-${stamp(input.now)}`
  for (let n = 1; ; n += 1) {
    const name = `${base}${n === 1 ? "" : `-${n}`}.html`
    if (!input.existingNames.has(name)) {
      return name
    }
  }
}

function fileSafe(text: string): string {
  return [
    ...text
      // eslint-disable-next-line no-control-regex
      .replaceAll(/[\u0000-\u001f\u007f/\\:*?"<>|.]/g, "")
      .trim()
      .replaceAll(/\s+/g, "-"),
  ]
    .slice(0, MAX_TITLE_LENGTH)
    .join("")
    .replace(/^-+|-+$/g, "")
}

function stamp(time: Temporal.PlainDateTime): string {
  return `${time.year}${two(time.month)}${two(time.day)}-${two(time.hour)}${two(time.minute)}`
}

function two(n: number): string {
  return String(n).padStart(2, "0")
}
