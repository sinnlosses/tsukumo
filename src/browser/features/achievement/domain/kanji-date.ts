// 日記帳の見開きに出す漢数字の日付・曜日（docs/screen-design.md 13.10「日記帳の見開き」）。

const KANJI_DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const

/** 4桁までの塊（千・百・十・一の位）を漢数字にする。0 なら空文字。 */
function kanjiGroup(value: number): string {
  const thousands = Math.floor(value / 1000)
  const hundreds = Math.floor((value % 1000) / 100)
  const tens = Math.floor((value % 100) / 10)
  const ones = value % 10
  const thousandsPart =
    thousands === 0 ? "" : `${thousands === 1 ? "" : (KANJI_DIGITS[thousands] ?? "")}千`
  const hundredsPart =
    hundreds === 0 ? "" : `${hundreds === 1 ? "" : (KANJI_DIGITS[hundreds] ?? "")}百`
  const tensPart = tens === 0 ? "" : `${tens === 1 ? "" : (KANJI_DIGITS[tens] ?? "")}十`
  const onesPart = ones === 0 ? "" : (KANJI_DIGITS[ones] ?? "")
  return `${thousandsPart}${hundredsPart}${tensPart}${onesPart}`
}

/** 漢数字（13.10「日記帳の見開き」右ページの日付・左ページの節目の数。0〜9999万台まで）。
 * 「万」は1でも頭に数字を置く（一万）が、「千」「百」「十」は1のとき数字を置かない（千・百・十）
 * のが日本語の慣例で、そのとおりに書き分けている。 */
export function kanjiNumeral(value: number): string {
  if (value === 0) {
    return KANJI_DIGITS[0]
  }
  const man = Math.floor(value / 10000)
  const rest = value % 10000
  const manPart = man === 0 ? "" : `${kanjiGroup(man)}万`
  return `${manPart}${kanjiGroup(rest)}`
}

/** 「九月十六日」の形（13.10「日記帳の見開き」右ページ）。 */
export function kanjiDateLabel(date: Temporal.PlainDate): string {
  return `${kanjiNumeral(date.month)}月${kanjiNumeral(date.day)}日`
}

const WEEKDAY_KANJI = ["月", "火", "水", "木", "金", "土", "日"] satisfies readonly string[]

/** 「水曜日」の形（`Temporal.PlainDate.dayOfWeek` は月曜が1、日曜が7）。 */
export function kanjiWeekdayLabel(date: Temporal.PlainDate): string {
  return `${WEEKDAY_KANJI[date.dayOfWeek - 1] ?? ""}曜日`
}
