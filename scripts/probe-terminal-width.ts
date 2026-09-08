// 端末が各文字を何カラムで描くかを、カーソル位置問い合わせ(DSR)で実測する。
// 素のターミナルで実行すること: bun run probe-width.ts
import process from "node:process"

const SAMPLES: readonly (readonly [string, string])[] = [
  ["A", "ASCII"],
  ["あ", "ひらがな(Wide)"],
  ["漢", "漢字(Wide)"],
  ["！", "全角感嘆符(Wide)"],
  ["─", "枠線 U+2500(Ambiguous)"],
  ["│", "縦線 U+2502(Ambiguous)"],
  ["╭", "角丸 U+256D(Ambiguous)"],
  ["—", "EM DASH U+2014(Ambiguous)"],
  ["→", "矢印 U+2192(Ambiguous)"],
  ["①", "丸数字 U+2460(Ambiguous)"],
  ["…", "三点リーダ U+2026(Ambiguous)"],
  ["～", "全角チルダ U+FF5E(Wide)"],
  ["♡", "ハート U+2661(Ambiguous)"],
]

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write("素のターミナルで直接実行してください（TTYが必要）\n")
  process.exit(2)
}

process.stdin.setRawMode(true)
process.stdin.resume()

// 応答は `ESC [ <row> ; <col> R`。制御文字を正規表現に書かずに済むよう、
// 末尾の "R" と区切りの ";" から桁を取り出す。
function parseColumn(response: string): number | undefined {
  const end = response.indexOf("R")
  const separator = response.lastIndexOf(";", end)
  if (end < 0 || separator < 0) {
    return undefined
  }

  const column = Number(response.slice(separator + 1, end))
  return Number.isFinite(column) ? column : undefined
}

function column(): Promise<number> {
  return new Promise((resolve) => {
    const onData = (chunk: Buffer) => {
      const parsed = parseColumn(String(chunk))
      if (parsed !== undefined) {
        process.stdin.off("data", onData)
        resolve(parsed)
      }
    }
    process.stdin.on("data", onData)
    process.stdout.write("\x1b[6n")
  })
}

const results: string[] = []
for (const [char, label] of SAMPLES) {
  process.stdout.write("\r\x1b[K")
  const before = await column()
  process.stdout.write(char)
  const after = await column()
  results.push(`  ${char}  幅${after - before}  ${label}`)
}
process.stdout.write("\r\x1b[K")

process.stdin.setRawMode(false)
process.stdin.pause()

console.log("=== この端末での実測幅 ===")
for (const line of results) console.log(line)
console.log("\nAmbiguous が 2 なら、今の実装は幅1と数えているのでズレます。")
