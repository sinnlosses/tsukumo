// ADR の一覧表・親の文書の子の一覧・子の文書の節の索引を、題と見出しから書き直す（`pnpm run format` が打つ）。

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { writeIndexes } from "./lib/document-index-repository.ts"

writeIndexes(REPOSITORY_ROOT)
