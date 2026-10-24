// `docs/readme/configuration.md` を読んで、載っている環境変数の名前を集める、という概念1つを持つ。

import { readFileSync } from "node:fs"
import { join } from "node:path"

import {
  type DocumentedEnvironmentVariable,
  findDocumentedEnvironmentVariables,
} from "../environment-variable.ts"

const CONFIGURATION_DOCUMENT_PATH = "docs/readme/configuration.md"

export function collectDocumentedEnvironmentVariables(
  root: string,
): readonly DocumentedEnvironmentVariable[] {
  return findDocumentedEnvironmentVariables(
    readFileSync(join(root, CONFIGURATION_DOCUMENT_PATH), "utf8"),
  )
}
