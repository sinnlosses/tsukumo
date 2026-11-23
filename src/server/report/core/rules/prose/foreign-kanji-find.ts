// 地の文から、Shift_JIS に無い漢字（簡体字など日本語でない漢字）を見つける。
// 日本の漢字かどうかは Unicode の属性に無いので、Shift_JIS の符号化の表を物差しにする。

import { unique } from "remeda"

import type { ReportOutline } from "../../../../../shared/report/report-outline.ts"
import type { ReportDraft } from "../draft.ts"
import { proseSegmentsOf, reportProseSegmentsOf } from "./plain-word-find.ts"

/** 常用漢字だが Shift_JIS の表に無い字。 */
const JOYO_KANJI_OUTSIDE_SHIFT_JIS = ["𠮟", "塡", "剝", "頰"]

const HAN = /^\p{Script=Han}$/u

/** レポートの地の文にある、日本語でない漢字を初出の順に返す。引用・コード・HTML の中は見ない。 */
export function foreignKanjiIn(
  report: Pick<ReportDraft, "conclusion" | "favor">,
  outline: ReportOutline,
): readonly string[] {
  return foreignKanjiOfProse(reportProseSegmentsOf(report, outline))
}

/** `speak` のセリフの地の文にある、日本語でない漢字を初出の順に返す。 */
export function foreignKanjiInSpeech(text: string): readonly string[] {
  return foreignKanjiOfProse(proseSegmentsOf(text))
}

function foreignKanjiOfProse(prose: readonly string[]): readonly string[] {
  const found: string[] = []
  for (const segment of prose) {
    for (const char of segment) {
      if (HAN.test(char) && !JAPANESE_KANJI.has(char)) {
        found.push(char)
      }
    }
  }
  return unique(found)
}

function japaneseKanjiSet(): ReadonlySet<string> {
  const decoder = new TextDecoder("shift_jis")
  const kanji = new Set<string>(JOYO_KANJI_OUTSIDE_SHIFT_JIS)
  const leads = [...range(0x81, 0x9f), ...range(0xe0, 0xfc)]
  const trails = range(0x40, 0xfc).filter((trail) => trail !== 0x7f)
  for (const lead of leads) {
    for (const trail of trails) {
      for (const char of decoder.decode(new Uint8Array([lead, trail]))) {
        if (HAN.test(char)) {
          kanji.add(char)
        }
      }
    }
  }
  return kanji
}

function range(from: number, to: number): readonly number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index)
}

const JAPANESE_KANJI: ReadonlySet<string> = japaneseKanjiSet()
