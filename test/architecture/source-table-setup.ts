// 規約のテストが読む `src/` の本文を実行ごとに1回だけ読み、`inject("sourceTable")` で各ファイルへ配る。

import type { TestProject } from "vitest/node"

import { readSourceTable, type SourceTable } from "./source-file.ts"

export default function setup(project: TestProject): void {
  project.provide("sourceTable", readSourceTable())
  project.onTestsRerun(() => {
    project.provide("sourceTable", readSourceTable())
  })
}

declare module "vitest" {
  export interface ProvidedContext {
    sourceTable: SourceTable
  }
}
