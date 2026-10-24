// `bd init` 済みの雛形を実行ごとに1回だけ作り、`inject("beadsTemplate")` で各ファイルへ配る。

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { TestProject } from "vitest/node"

import { bd, writeBeadsConfig } from "./fixture/beads-repository.ts"
import { git, initGitRepository } from "./fixture/git-repository.ts"

export default async function setup(project: TestProject): Promise<() => void> {
  const root = mkdtempSync(join(tmpdir(), "tsukumo-beads-template-"))
  const home = join(root, "home")
  const repository = join(root, "repository")
  writeBeadsConfig(home)
  await initGitRepository(repository)
  await git(repository, "commit", "--allow-empty", "-m", "init")
  await bd(repository, home, "init", "--stealth", "-p", "t", "-q")
  project.provide("beadsTemplate", { home, repository })
  return () => {
    rmSync(root, { recursive: true, force: true })
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    beadsTemplate: { readonly home: string; readonly repository: string }
  }
}
