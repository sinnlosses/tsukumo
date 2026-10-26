// ADR の一覧表・親の文書の目次を題と責務の行から書き直し、子の文書の節の索引を消す（`pnpm run format` が打つ）。

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { writeIndexes } from "./lib/document-index-repository.ts"

writeIndexes(REPOSITORY_ROOT)
