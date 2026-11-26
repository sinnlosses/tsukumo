// python3・node で走らせるスクリプトのファイルを読み、作業ツリーの中へ書くものを止める判定を、関数で確かめる。

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { describe, expect, test } from "vitest"

import { findDeniedBashRule } from "../../../../scripts/hook/lib/shell-write-rule.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

const WORK_ROOT = "/work/tree"

function isDenied(
  command: string,
  options: { readonly cwd?: string; readonly workRoot?: string } = {},
): boolean {
  return findDeniedBashRule(command, options.cwd, options.workRoot ?? WORK_ROOT) !== undefined
}

describe("python3 で走らせるスクリプトのファイル", () => {
  const dir = useTempDir("deny-sed")
  const WRITES_INSIDE = "open('/work/tree/f.txt', 'w').write('x')\n"
  const WRITES_OUTSIDE = "open('/private/tmp/x/draft.md', 'w').write('x')\n"

  function scriptPath(source: string, name = "split.py"): string {
    const path = join(dir(), name)
    writeFileSync(path, source)
    return path
  }

  test.each([
    ["python3 の絶対パス", (path: string) => `python3 ${path}`],
    ["前置きの環境変数とフラグ", (path: string) => `PYTHONUTF8=1 python3 -u ${path}`],
    ["&& の後ろで引数付き", (path: string) => `cd x && python ${path} --flag`],
    ["引用符つきのパス", (path: string) => `python3 "${path}"`],
  ])("作業ツリーの中へ書くスクリプト（%s）は止める", (_name, toCommand) => {
    expect(isDenied(toCommand(scriptPath(WRITES_INSIDE)))).toBe(true)
  })

  test("相対パスは入力の cwd から解いて止める", () => {
    scriptPath(WRITES_INSIDE)
    expect(isDenied("python3 split.py", { cwd: dir() })).toBe(true)
  })

  test("書き先が読めないスクリプトも止める", () => {
    expect(isDenied(`python3 ${scriptPath("open(path, 'w').write('x')\n")}`)).toBe(true)
  })

  test("書き先が作業ツリーの外のリテラルなら通す", () => {
    expect(isDenied(`python3 ${scriptPath(WRITES_OUTSIDE)}`)).toBe(false)
  })

  test("読めないパスなら通す", () => {
    expect(isDenied(`python3 ${join(dir(), "missing.py")}`)).toBe(false)
  })

  test("cwd が無いときの相対パスは読まずに通す", () => {
    scriptPath(WRITES_INSIDE)
    expect(isDenied("python3 split.py")).toBe(false)
  })

  test("引用符の中にデータとして書いただけの語は通す", () => {
    const path = scriptPath(WRITES_INSIDE)
    expect(isDenied(`echo "python3 ${path}"`)).toBe(false)
  })

  describe("別の git 作業ツリーにあるスクリプト", () => {
    const BUILDS_PATH =
      "import os, tempfile\nbase = tempfile.mkdtemp()\npath = os.path.join(base, 'out.txt')\nopen(path, 'w').write('x')\n"

    function foreignScript(source: string): string {
      mkdirSync(join(dir(), "other", ".git"), { recursive: true })
      const path = join(dir(), "other", "selftest.py")
      writeFileSync(path, source)
      return path
    }

    test("その作業ツリーを cwd にして走らせるなら通す", () => {
      foreignScript(BUILDS_PATH)
      expect(isDenied("python3 selftest.py", { cwd: join(dir(), "other") })).toBe(false)
    })

    test("その作業ツリーへ cd してから走らせるなら通す", () => {
      const path = foreignScript(BUILDS_PATH)
      expect(isDenied(`cd ${dirname(path)} && python3 ${path}`)).toBe(false)
    })

    test("相対パスのスクリプトも cd 先から読んで通す", () => {
      foreignScript(BUILDS_PATH)
      expect(isDenied(`cd ${join(dir(), "other")} && python3 selftest.py`)).toBe(false)
    })

    test("cwd に同名のファイルがあっても cd 先のスクリプトを読む", () => {
      foreignScript("open('/work/tree/f.txt', 'w').write('x')\n")
      mkdirSync(join(dir(), "here"))
      writeFileSync(join(dir(), "here", "selftest.py"), BUILDS_PATH)
      expect(
        isDenied(`cd ${join(dir(), "other")} && python3 selftest.py`, { cwd: join(dir(), "here") }),
      ).toBe(true)
    })

    test("; でつないだ cd のあとなら通す", () => {
      const path = foreignScript(BUILDS_PATH)
      expect(isDenied(`cd ${dirname(path)}; python3 ${path}`)).toBe(false)
    })

    test.each([
      ["サブシェルの中の cd", (other: string) => `(cd ${other} && true); python3 `],
      ["& でつないだ cd", (other: string) => `cd ${other} & python3 `],
      ["| でつないだ cd", (other: string) => `cd ${other} | python3 `],
      ["|| でつないだ cd", (other: string) => `cd ${other} || python3 `],
    ])("%s は作業ディレクトリが変わったと読まずに止める", (_name, toPrefix) => {
      const path = foreignScript(BUILDS_PATH)
      expect(isDenied(`${toPrefix(dirname(path))}${path}`)).toBe(true)
    })

    test("作業ツリーの絶対パスを書くスクリプトは cd していても止める", () => {
      const path = foreignScript("open('/work/tree/f.txt', 'w').write('x')\n")
      expect(isDenied(`cd ${dirname(path)} && python3 ${path}`)).toBe(true)
    })

    test.each([
      ["作業ツリーを cwd にする", "python3"],
      ["作業ツリーの中へ cd する", "cd /work/tree/src &&"],
    ])("%s と、パスを組み立てて書くスクリプトも止める", (_name, prefix) => {
      const path = foreignScript(BUILDS_PATH)
      const command = prefix.endsWith("python3") ? `${prefix} ${path}` : `${prefix} python3 ${path}`
      expect(isDenied(command)).toBe(true)
    })
  })

  describe("プラグインのキャッシュにあるスクリプト", () => {
    const WRITES_ARGUMENT =
      "import sys, pathlib\npathlib.Path(sys.argv[1], 'meta.json').write_text('{}')\n"

    function pluginScript(source: string): string {
      const scripts = join(dir(), ".claude", "plugins", "cache", "market", "plugin", "scripts")
      mkdirSync(scripts, { recursive: true })
      const path = join(scripts, "write_meta.py")
      writeFileSync(path, source)
      return path
    }

    test("作業ツリーの外へ cd してから走らせるなら通す", () => {
      const path = pluginScript(WRITES_ARGUMENT)
      expect(isDenied(`cd /tmp && python3 "${path}" /tmp/run /work/tree`)).toBe(false)
    })

    test("作業ツリーを cwd にして走らせるなら止める", () => {
      const path = pluginScript(WRITES_ARGUMENT)
      expect(isDenied(`python3 "${path}" /tmp/run`, { cwd: WORK_ROOT })).toBe(true)
    })

    test("作業ツリーの絶対パスを書くスクリプトは cd していても止める", () => {
      const path = pluginScript(WRITES_INSIDE)
      expect(isDenied(`cd /tmp && python3 "${path}"`)).toBe(true)
    })
  })

  test("-m はスクリプトのファイルを取らないので通す", () => {
    scriptPath(WRITES_INSIDE, "pytest.py")
    expect(isDenied(`python3 -m ${join(dir(), "pytest.py")}`)).toBe(false)
  })
})

describe("node で走らせるスクリプトのファイル", () => {
  const dir = useTempDir("deny-node")

  function scriptPath(source: string, name = "edit.mjs"): string {
    const path = join(dir(), name)
    writeFileSync(path, source)
    return path
  }

  test.each([
    ["相対パスへの writeFileSync", "import fs from 'node:fs'\nfs.writeFileSync('src/a.ts', 'x')\n"],
    [
      "組み立てたパスへの writeFileSync",
      "import { writeFileSync } from 'node:fs'\nwriteFileSync(join(root, 'a.ts'), 'x')\n",
    ],
    ["作業ツリーの中への copyFileSync", "fs.copyFileSync('/tmp/x/a', '/work/tree/a.ts')\n"],
  ])("作業ツリーの中へ書くスクリプト（%s）は止める", (_name, source) => {
    expect(isDenied(`node ${scriptPath(source)}`)).toBe(true)
  })

  test("値を取る引数のあとのスクリプトも読む", () => {
    const path = scriptPath("fs.writeFileSync('src/a.ts', 'x')\n", "edit.ts")
    expect(isDenied(`node --import tsx ${path} --flag`)).toBe(true)
  })

  test("< で標準入力へ渡すスクリプトも読む", () => {
    const path = scriptPath("fs.writeFileSync('src/a.ts', 'x')\n")
    expect(isDenied(`node < ${path}`)).toBe(true)
  })

  test("相対パスは入力の cwd から解いて止める", () => {
    scriptPath("fs.writeFileSync('src/a.ts', 'x')\n")
    expect(isDenied("node edit.mjs", { cwd: dir() })).toBe(true)
  })

  test("書き先が作業ツリーの外のリテラルなら通す", () => {
    const path = scriptPath("fs.writeFileSync('/private/tmp/x/draft.md', 'x')\n")
    expect(isDenied(`node ${path}`)).toBe(false)
  })

  test("読めないパスなら通す", () => {
    expect(isDenied(`node ${join(dir(), "missing.mjs")}`)).toBe(false)
  })

  test("作業ツリーの中のスクリプトは読まずに通す", () => {
    scriptPath("fs.writeFileSync(path, 'x')\n", "generate.ts")
    expect(isDenied("node generate.ts", { cwd: dir(), workRoot: dir() })).toBe(false)
  })
})

describe("画像の cp の書き先が実在するディレクトリのとき", () => {
  const dir = useTempDir("deny-image-cp")

  test("拡張子の無いディレクトリへ置くなら通す", () => {
    mkdirSync(join(dir(), "assets"))
    const options = { cwd: dir(), workRoot: dir() }
    expect(isDenied("cp /tmp/x/a.png assets", options)).toBe(false)
    expect(isDenied("cp /tmp/x/a.png Makefile", options)).toBe(true)
  })
})
