// リポジトリのファイルを読み、decision.md を引く参照と decision.md の見出しを照らして食い違いを集める、
// という概念1つを持つ。

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  DECISION_PATH,
  findDecisionReferences,
  findStrayDecisionReferences,
  readDecisionHeadings,
} from "../decision-reference.ts"
import { isScannedSource, type SectionReference } from "../section-reference.ts"
import { listSourcePaths } from "./source-file-list.ts"

/** `root` 以下を読み、見出しに前方一致しない decision.md への参照をすべて返す。 */
export function collectStrayDecisionReferences(root: string): SectionReference[] {
  const references = listSourcePaths(root)
    .filter(isScannedSource)
    .flatMap((path) => findDecisionReferences(path, readFileSync(join(root, path), "utf8")))
  const headings = readDecisionHeadings(readFileSync(join(root, DECISION_PATH), "utf8"))
  return findStrayDecisionReferences(references, headings)
}
