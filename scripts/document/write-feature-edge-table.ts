// サーバの機能どうしの辺の表を、`.dependency-cruiser.cjs` の規則から書き直す（`pnpm run format` が打つ）。

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { rewriteFeatureEdgeTable } from "./feature-edge-table.ts"

const SERVER_FEATURE_PATH = join(REPOSITORY_ROOT, "docs/architecture/server-feature.md")

const text = readFileSync(SERVER_FEATURE_PATH, "utf8")
const rewritten = rewriteFeatureEdgeTable(text)
if (rewritten !== text) {
  writeFileSync(SERVER_FEATURE_PATH, rewritten)
}
