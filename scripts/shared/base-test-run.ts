// 変えた単体テストを変更前の実装に対して走らせた結果から、「1 件も落ちなかったテストのファイル」を選ぶ、という概念1つを持つ。git・vitest には触らない。

const UNIT_TEST_PATTERN = /^test\/.*\.test\.tsx?$/
const EXCLUDED_PREFIXES = ["test/e2e/", "test/architecture/"] as const

type VitestFileResult = { readonly name: string; readonly status: string }

/** 変えたパスのうち、単体テストのファイルだけを返す（E2E と規約のテストは除く）。 */
export function selectChangedUnitTests(paths: readonly string[]): string[] {
  return paths.filter(
    (path) =>
      UNIT_TEST_PATTERN.test(path) && !EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix)),
  )
}

/** vitest の `--reporter=json` の出力から、`files` のうち全件が通ったファイルを返す。結果に無いファイルは含めない。 */
export function filesPassingOnBase(vitestJson: string, files: readonly string[]): string[] {
  const parsed: unknown = JSON.parse(vitestJson)
  const results = readFileResults(parsed)
  return files.filter((file) =>
    results.some((result) => result.status === "passed" && result.name.endsWith(`/${file}`)),
  )
}

export function formatPassOnBase(file: string): string {
  return `TESTS_PASS_ON_BASE\t${file}`
}

function readFileResults(parsed: unknown): VitestFileResult[] {
  if (typeof parsed !== "object" || parsed === null || !("testResults" in parsed)) {
    throw new Error("vitest の json に testResults が無い")
  }
  const testResults: unknown = parsed.testResults
  if (!Array.isArray(testResults)) {
    throw new Error("vitest の json の testResults が配列ではない")
  }
  return testResults.flatMap((entry: unknown) => {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "name" in entry &&
      "status" in entry &&
      typeof entry.name === "string" &&
      typeof entry.status === "string"
    ) {
      return [{ name: entry.name, status: entry.status }]
    }
    return []
  })
}
