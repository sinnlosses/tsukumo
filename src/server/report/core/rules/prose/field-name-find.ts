// セリフの文から、`report` の欄の名前（`keyFigures` など）を見つける。
// 欄の名前は画面に出ないので、セリフで部品を指すと利用者はどこを読めばよいか分からない。

import { keys } from "remeda"

import { REPORT_COMPONENT_SCHEMAS } from "../../../../../shared/report/a2ui-report-catalog.ts"

/**
 * 根の `Report` の欄のうち、綴りに大文字を含むもの。
 * `task`・`title` のような普通の英単語の欄は、識別子でない語と取り違えるので入れない。
 */
const CAMEL_CASE_FIELD_NAMES: readonly string[] = keys(
  REPORT_COMPONENT_SCHEMAS.Report.shape,
).filter((name) => /[A-Z]/.test(name))

/** セリフの文に出てくる欄の名前を、欄の並び順に返す。前後が英字に続く綴り（`keyFiguresX`）は数えない。 */
export function reportFieldNamesInSpeech(text: string): readonly string[] {
  return CAMEL_CASE_FIELD_NAMES.filter((name) =>
    new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`).test(text),
  )
}
