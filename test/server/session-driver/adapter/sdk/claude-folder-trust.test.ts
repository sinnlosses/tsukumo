import { mkdirSync, openSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { isFolderTrusted } from "../../../../../src/server/session-driver/adapter/sdk/claude-folder-trust.ts"
import { useTempDir } from "../../../../fixture/temp-dir.ts"

// 読み手が開いてよいのは、テストごとの一時ディレクトリの中だけ。
// 外を開こうとしたら開かずに投げ（読み手は読めないものとして扱う）、呼ばれた控えをテストが確かめる。
const sandbox = vi.hoisted(() => ({ root: "" }))

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<{ readonly openSync: typeof openSync }>()
  return {
    ...actual,
    openSync: vi.fn<typeof openSync>((path, flags, mode) => {
      if (sandbox.root === "" || typeof path !== "string" || !path.startsWith(`${sandbox.root}/`)) {
        throw new Error("一時ディレクトリの外は開かない")
      }
      return actual.openSync(path, flags, mode)
    }),
  }
})

const dir = useTempDir("claude-folder-trust")

beforeEach(() => {
  sandbox.root = fixtureRoot()
  vi.mocked(openSync).mockClear()
})

/** 一時ディレクトリの実の場所。Claude Code の控えはリンクを解いた場所で書かれる。 */
function fixtureRoot(): string {
  return realpathSync(dir())
}

function folder(...segments: readonly string[]): string {
  const path = join(fixtureRoot(), ...segments)
  mkdirSync(path, { recursive: true })
  return path
}

/** 控え（`.claude.json`）を置いた設定ディレクトリを返す。 */
function configWith(state: unknown): string {
  const configDir = folder("config")
  writeFileSync(join(configDir, ".claude.json"), JSON.stringify(state))
  return configDir
}

function trustedFolders(...folders: readonly string[]): string {
  return configWith({
    projects: Object.fromEntries(folders.map((path) => [path, { hasTrustDialogAccepted: true }])),
  })
}

function trusted(
  cwd: string,
  claudeConfigDir: string,
  inheritedEnv: Readonly<Record<string, string>> = {},
): boolean {
  return isFolderTrusted({ cwd, claudeConfigDir, inheritedEnv })
}

/** git が別の作業ツリーを足したときの形（共通の git ディレクトリの `worktrees/<name>` と、作業ツリーの `.git` が指し合う）。 */
function linkWorktree(commonDir: string, worktree: string, name: string): string {
  const gitDir = join(commonDir, "worktrees", name)
  mkdirSync(gitDir, { recursive: true })
  writeFileSync(join(gitDir, "commondir"), "../..\n")
  writeFileSync(join(gitDir, "gitdir"), `${join(worktree, ".git")}\n`)
  writeFileSync(join(worktree, ".git"), `gitdir: ${gitDir}\n`)
  return gitDir
}

/** 読み手が一時ディレクトリの外で開こうとしたパス。 */
function openedOutside(): readonly string[] {
  const opened = vi.mocked(openSync).mock.calls.map(([path]) => String(path))
  return opened.filter((path) => !path.startsWith(`${fixtureRoot()}/`))
}

describe("isFolderTrusted", () => {
  it("作業ディレクトリに信頼の印があれば信頼している（リンクを解いた場所で照らす）", () => {
    const plain = folder("plain")
    const config = trustedFolders(plain)

    expect(trusted(plain, config)).toBe(true)
    expect(trusted(join(dir(), "plain"), config)).toBe(true)
  })

  it("控えが無い・印が true でない・projects が無いときは信頼していない", () => {
    const plain = folder("plain")
    const states = [
      { projects: { [plain]: { hasTrustDialogAccepted: "true" } } },
      { projects: { [plain]: true } },
      { [plain]: { hasTrustDialogAccepted: true } },
    ]

    expect(trusted(plain, folder("empty"))).toBe(false)
    expect(states.map((state) => trusted(plain, configWith(state)))).toEqual([false, false, false])
  })

  it("作業ツリーの外なら、信頼した親フォルダの下も信頼している", () => {
    const parent = folder("src")
    const config = trustedFolders(parent)

    expect(trusted(folder("src", "download", "sub"), config)).toBe(true)
  })

  it("作業ツリーの中なら、作業ツリーの根より上の信頼した親フォルダの控えを数えない", () => {
    const config = trustedFolders(folder("src"))
    const repository = folder("src", "cloned")
    folder("src", "cloned", ".git")
    folder("src", "cloned", ".claude")
    writeFileSync(join(repository, ".claude", "settings.json"), JSON.stringify({ hooks: {} }))

    expect(trusted(repository, config)).toBe(false)
    expect(trusted(folder("src", "cloned", "pkg"), config)).toBe(false)
    expect(openedOutside()).toEqual([])
  })

  it("作業ツリーの中なら、作業ディレクトリからその根までの控えを数える", () => {
    const repository = folder("repository")
    folder("repository", ".git")
    const config = trustedFolders(repository)

    expect(trusted(folder("repository", "pkg", "deep"), config)).toBe(true)
  })

  it("別の作業ツリーは、本体のチェックアウトの控えを数える", () => {
    const main = folder("main")
    const worktree = folder("worktree")
    linkWorktree(folder("main", ".git"), worktree, "worktree")
    const config = trustedFolders(main)

    expect(trusted(worktree, config)).toBe(true)
    expect(trusted(folder("worktree", "pkg"), config)).toBe(true)
  })

  it("bare リポジトリの作業ツリーは、その置き場の控えを数える。置き場に .git があれば数えない", () => {
    const bare = folder("bare")
    const worktree = folder("bare-worktree")
    linkWorktree(bare, worktree, "main")
    const config = trustedFolders(bare)

    expect(trusted(worktree, config)).toBe(true)

    folder("bare", ".git")

    expect(trusted(worktree, config)).toBe(false)
  })

  it("指し戻しの gitdir が作業ツリーを指さなければ、本体の控えを数えない", () => {
    const main = folder("main")
    const worktree = folder("worktree")
    const gitDir = linkWorktree(folder("main", ".git"), worktree, "worktree")
    writeFileSync(join(gitDir, "gitdir"), `${join(folder("other"), ".git")}\n`)

    expect(trusted(worktree, trustedFolders(main))).toBe(false)
    expect(openedOutside()).toEqual([])
  })

  // 作業ツリーの中の指し先は、リポジトリの作り手が commondir も gitdir も書ける。
  it("指し先が作業ツリーの中にあれば、名前が worktrees の親を本体とみなさない", () => {
    const config = trustedFolders(folder("src"))
    const cloned = folder("src", "worktrees", "cloned")
    writeFileSync(join(cloned, ".git"), "gitdir: .\n")
    writeFileSync(join(cloned, "commondir"), "../..\n")
    writeFileSync(join(cloned, "gitdir"), ".git\n")

    expect(trusted(cloned, config)).toBe(false)
    expect(openedOutside()).toEqual([])
  })

  it("指し先のファイルが上限より大きければ、本体の控えを数えない", () => {
    const main = folder("main")
    const worktree = folder("worktree")
    const gitDir = linkWorktree(folder("main", ".git"), worktree, "worktree")
    writeFileSync(join(gitDir, "commondir"), `../..${" ".repeat(64 * 1024)}\n`)

    expect(trusted(worktree, trustedFolders(main))).toBe(false)
    expect(openedOutside()).toEqual([])
  })

  it("指し先のファイルがリンクなら辿らず、本体の控えを数えない", () => {
    const main = folder("main")
    const worktree = folder("worktree")
    const gitDir = linkWorktree(folder("main", ".git"), worktree, "worktree")
    const target = join(folder("elsewhere"), "commondir")
    writeFileSync(target, "../..\n")
    rmSync(join(gitDir, "commondir"))
    symlinkSync(target, join(gitDir, "commondir"))

    expect(trusted(worktree, trustedFolders(main))).toBe(false)
    expect(openedOutside()).toEqual([])
  })

  it("CLAUDE_CODE_IGNORE_PERSISTED_TRUST が立っていれば、どの控えも数えない", () => {
    const plain = folder("plain")
    const config = trustedFolders(plain)

    expect(trusted(plain, config, { CLAUDE_CODE_IGNORE_PERSISTED_TRUST: "1" })).toBe(false)
    expect(trusted(plain, config, { CLAUDE_CODE_IGNORE_PERSISTED_TRUST: "0" })).toBe(true)
  })
})
