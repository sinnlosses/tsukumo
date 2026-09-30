// ファイルを書き換える `sed -i`・`perl -pi` / `perl -i`・Python の書き込みを止める PreToolUse hook の
// 契約（終了コード 2 で実行を止め、stderr で Edit を促す）を、スクリプトを実際に起こして確かめる。

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"

import { describe, expect, test } from "vitest"

import { runSubprocess } from "../fixture/subprocess.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

const HOOK_PATH = "scripts/deny-sed-in-place.ts"
const WORK_ROOT = "/work/tree"
const NO_PROJECT_DIR = Symbol("no CLAUDE_PROJECT_DIR")

describe("ファイルを書き換えるコマンドを拒否する hook", () => {
  test.each([
    ["sed -i", "sed -i 's/a/b/' file.ts"],
    ["sed -i.bak", "sed -i.bak 's/a/b/' file.ts"],
    ["sed -i と空の接尾辞", "sed -i '' 's/a/b/' file.ts"],
    ["sed --in-place", "sed --in-place 's/a/b/' file.ts"],
    ["sed の他の短い引数とまとめた -ni", "sed -ni 's/a/b/p' file.ts"],
    ["パイプの後ろの sed -i", "cat list | xargs sed -i 's/a/b/'"],
    ["&& の後ろの sed -i.bak", "cd src && sed -i.bak 's/a/b/' file.ts"],
    ["perl -pi", "perl -pi -e 's/a/b/' file.ts"],
    ["perl -i", "perl -i -pe 's/a/b/' file.ts"],
    ["perl -i.bak", "perl -i.bak -pe 's/a/b/' file.ts"],
    ["python3 -c の書き込みモード", "python3 -c \"with open('f.txt', 'w') as fh: fh.write('x')\""],
    [
      "python3 の heredoc の書き込みモード",
      "python3 - <<'EOF'\nwith open('f.txt', 'w') as fh:\n    fh.write('x')\nEOF",
    ],
    [
      "python3 -c の write_text",
      "python3 -c \"import pathlib; pathlib.Path('f.txt').write_text('x')\"",
    ],
    [
      "作業ツリーの中の絶対パスへの open",
      "python3 -c \"open('/work/tree/f.txt', 'w').write('x')\"",
    ],
    [
      "変数を書き込み先にした open",
      "python3 - <<'EOF'\nwith open(path, 'w') as fh:\n    fh.write('x')\nEOF",
    ],
    [
      "Path を組み立てた write_text",
      "python3 - <<'EOF'\nfrom pathlib import Path\nPath('/tmp/x').write_text('x')\nEOF",
    ],
    ["ホーム展開を含む open", "python3 -c \"open('~/x', 'w').write('x')\""],
    ["外へ出て戻る .. を含む open", "python3 -c \"open('/tmp/../work/tree/x', 'w').write('x')\""],
    ["連結した書き込み先の open", "python3 -c \"open('/tmp/' + name, 'w').write('x')\""],
    [
      "外への書き込みと中への書き込みが混在",
      "python3 - <<'EOF'\nopen('/tmp/a', 'w').write('x')\nopen('/work/tree/b', 'w').write('x')\nEOF",
    ],
    [
      "mode 引数で書き込みにした作業ツリーの中の open",
      "python3 -c \"open('/work/tree/x', encoding='utf-8', mode='w').write('x')\"",
    ],
  ])("%s は止めて Edit を促す", async (_name, command) => {
    const result = await runHook(command)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("Edit")
    expect(result.stderr).toContain("Write")
  })

  test("作業ツリーの根が分からないときは外への open も止める", async () => {
    const result = await runRaw(
      JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "python3 -c \"open('/tmp/x', 'w').write('x')\"" },
      }),
      NO_PROJECT_DIR,
    )
    expect(result.exitCode).toBe(2)
  })

  test.each([
    ["読むだけの sed -n", "sed -n '1,5p' file.ts"],
    ["標準出力へ出す sed", "sed 's/a/b/' file.ts"],
    ["語として書いただけの grep", "grep 'sed -i' docs/workflow.md"],
    ["読むだけの perl -ne", "perl -ne 'print if /foo/' file.ts"],
    ["書き戻さない perl -e", "perl -e 'print 1'"],
    ["読むだけの python3 -c", "python3 -c \"with open('f.txt') as fh: print(fh.read())\""],
    ["ファイルを開かない python3 -c", "python3 -c 'import json; print(json.dumps({\"a\": 1}))'"],
    ["読むだけの python3 の heredoc", "python3 - <<'EOF'\nprint('hi')\nEOF"],
    [
      "heredoc の本文に sed -i の文字列を含むだけの tw new",
      "tw new --body-file - <<'EOF'\nsed -i 's/a/b/' file.ts\nEOF",
    ],
    [
      "heredoc の本文に sed -i の文字列を含むだけの git commit",
      "git commit -m \"$(cat <<'EOF'\nsed -i change\nEOF\n)\"",
    ],
    [
      "作業ツリーの外の絶対パスへの heredoc の open",
      "python3 - <<'EOF'\nwith open('/private/tmp/x/draft.md', 'w') as fh:\n    fh.write('x')\nEOF",
    ],
    ["作業ツリーの外の絶対パスへの python3 -c", "python3 -c \"open('/tmp/x.md', 'w').write('x')\""],
    [
      "作業ツリーの外への mode 引数の open",
      "python3 -c \"open('/tmp/x.md', encoding='utf-8', mode='w').write('x')\"",
    ],
  ])("%s は通す", async (_name, command) => {
    expect((await runHook(command)).exitCode).toBe(0)
  })

  test("Bash 以外のツールには関わらない", async () => {
    expect((await runHook("sed -i 's/a/b/' f", "Read")).exitCode).toBe(0)
  })

  test("作業ツリーの根は入力の cwd でも読む", async () => {
    const command = "python3 -c \"open('/tmp/x', 'w').write('x')\""
    const outside = await runRaw(
      JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: WORK_ROOT }),
      NO_PROJECT_DIR,
    )
    const inside = await runRaw(
      JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "python3 -c \"open('/tmp/x/y', 'w').write('x')\"" },
        cwd: "/tmp/x",
      }),
      NO_PROJECT_DIR,
    )
    expect(outside.exitCode).toBe(0)
    expect(inside.exitCode).toBe(2)
  })

  test("形が違う入力では実行を止めない", async () => {
    expect((await runRaw("これは JSON ではない")).exitCode).toBe(0)
  })
})

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
  ])("作業ツリーの中へ書くスクリプト（%s）は止める", async (_name, toCommand) => {
    const result = await runHook(toCommand(scriptPath(WRITES_INSIDE)))
    expect(result.exitCode).toBe(2)
  })

  test("相対パスは入力の cwd から解いて止める", async () => {
    scriptPath(WRITES_INSIDE)
    const result = await runRaw(
      JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "python3 split.py" },
        cwd: dir(),
      }),
    )
    expect(result.exitCode).toBe(2)
  })

  test("書き先が読めないスクリプトも止める", async () => {
    const result = await runHook(`python3 ${scriptPath("open(path, 'w').write('x')\n")}`)
    expect(result.exitCode).toBe(2)
  })

  test("書き先が作業ツリーの外のリテラルなら通す", async () => {
    const result = await runHook(`python3 ${scriptPath(WRITES_OUTSIDE)}`)
    expect(result.exitCode).toBe(0)
  })

  test("読めないパスなら通す", async () => {
    expect((await runHook(`python3 ${join(dir(), "missing.py")}`)).exitCode).toBe(0)
  })

  test("cwd が無いときの相対パスは読まずに通す", async () => {
    scriptPath(WRITES_INSIDE)
    expect((await runHook("python3 split.py")).exitCode).toBe(0)
  })

  test("引用符の中にデータとして書いただけの語は通す", async () => {
    const path = scriptPath(WRITES_INSIDE)
    expect((await runHook(`echo "python3 ${path}"`)).exitCode).toBe(0)
  })

  test("-m はスクリプトのファイルを取らないので通す", async () => {
    scriptPath(WRITES_INSIDE, "pytest.py")
    expect((await runHook(`python3 -m ${join(dir(), "pytest.py")}`)).exitCode).toBe(0)
  })
})

function runHook(command: string, toolName = "Bash") {
  return runRaw(JSON.stringify({ tool_name: toolName, tool_input: { command } }), WORK_ROOT)
}

function runRaw(input: string, projectDir: string | typeof NO_PROJECT_DIR = WORK_ROOT) {
  return runSubprocess(process.execPath, [HOOK_PATH], {
    input,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectDir === NO_PROJECT_DIR ? undefined : projectDir,
    },
  })
}
