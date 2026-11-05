// サーバの機能どうしのエッジの表を、`.dependency-cruiser.cjs` の規則から書き直す（`pnpm run format` が打つ）。

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import {
  readFeatureEdgeGraph,
  rewriteFeatureEdgeGraph,
  rewriteFeatureEdgeTable,
} from "./feature-edge-table.ts"

const SERVER_FEATURE_PATH = join(REPOSITORY_ROOT, "docs/architecture/server-feature.md")

const OVERVIEW_PATH = join(REPOSITORY_ROOT, "docs/guide/overview.md")

const text = readFileSync(SERVER_FEATURE_PATH, "utf8")
const rewritten = rewriteFeatureEdgeTable(text)
if (rewritten !== text) {
  writeFileSync(SERVER_FEATURE_PATH, rewritten)
}

const overview = readFileSync(OVERVIEW_PATH, "utf8")
const overviewRewritten = rewriteFeatureEdgeGraph(overview, readFeatureEdgeGraph())
if (overviewRewritten !== overview) {
  writeFileSync(OVERVIEW_PATH, overviewRewritten)
}
