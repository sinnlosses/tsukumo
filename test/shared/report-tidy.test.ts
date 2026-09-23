import { describe, expect, it } from "bun:test"

import { tidyReportBody } from "../../src/shared/report-tidy.ts"

// フィクスチャはすべて手で書いた架空の本文（docs/coding-standards.md「会話内容の扱い」）。
const CONCLUSION = "架空の結論。"

const tidy = (body: string, conclusion = CONCLUSION) => tidyReportBody({ conclusion, body })

describe("tidyReportBody", () => {
  it("落とすものが無ければ引数のまま返す（空行の連続も詰めない）", () => {
    const body = "## 架空の見出し\n\n架空の本文。\n\n\n\n- 架空の項目\n"

    expect(tidy(body)).toBe(body)
    expect(tidy("")).toBe("")
  })

  describe("conclusion を body の冒頭で繰り返している行", () => {
    it("冒頭の段落が conclusion と同じなら落とす（前後の空白と改行の位置は見ない）", () => {
      expect(tidy(`${CONCLUSION}\n\n架空の根拠。`)).toBe("架空の根拠。")
      expect(
        tidy(
          "\n  架空の結論その1。\n架空の結論その2。  \n\n架空の根拠。",
          "架空の結論その1。架空の結論その2。",
        ),
      ).toBe("架空の根拠。")
    })

    it("冒頭の段落の頭の行だけが conclusion と同じなら、その行だけを落とす", () => {
      expect(tidy(`${CONCLUSION}\n架空の続き。\n\n架空の根拠。`)).toBe(
        "架空の続き。\n\n架空の根拠。",
      )
    })

    it("冒頭でない繰り返し・一部だけの一致・記法で包んだ繰り返しは落とさない", () => {
      const repeatedLater = `架空の根拠。\n\n${CONCLUSION}`
      const partial = "架空の結論。ただし架空の条件つき。\n\n架空の根拠。"
      const quoted = `> ${CONCLUSION}\n\n架空の根拠。`
      const bold = `**${CONCLUSION}**\n\n架空の根拠。`

      expect(tidy(repeatedLater)).toBe(repeatedLater)
      expect(tidy(partial)).toBe(partial)
      expect(tidy(quoted)).toBe(quoted)
      expect(tidy(bold)).toBe(bold)
    })

    it("冒頭がフェンスなら、中身が conclusion と同じでも落とさない", () => {
      const fenced = `\`\`\`text\n${CONCLUSION}\n\`\`\`\n\n架空の根拠。`

      expect(tidy(fenced)).toBe(fenced)
    })
  })

  describe("前置き・締めの定型だけの行", () => {
    it("定型だけの行を落とす（句点の有無は見ない）", () => {
      expect(tidy("架空の根拠。\n\n以上です。")).toBe("架空の根拠。")
      expect(tidy("以下にまとめます。\n\n架空の根拠。\n\n何かあれば言ってください")).toBe(
        "架空の根拠。",
      )
    })

    it("段落の途中の行でも、行ぜんぶが定型なら落とす", () => {
      expect(tidy("架空の根拠。\n以上です。")).toBe("架空の根拠。")
    })

    it("定型に中身が続く行・定型を含むだけの行は落とさない", () => {
      const body =
        "以上です。架空の補足がひとつある。\n\n架空の設定は以上です。\n\n以上の3点を直した。"

      expect(tidy(body)).toBe(body)
    })

    it("フェンス・表・引用・箇条書きの中の定型は落とさない", () => {
      const fenced = "```text\n以上です。\n```"
      const table = "**架空の表**\n\n| 列 |\n| --- |\n| 以上です |"
      const quote = "> 以上です。"
      const list = "- 以上です"

      expect(tidy(fenced)).toBe(fenced)
      expect(tidy(table)).toBe(table)
      expect(tidy(quote)).toBe(quote)
      expect(tidy(list)).toBe(list)
    })
  })

  describe("中身の無い見出し", () => {
    it("末尾の見出し・同じか浅い見出しがすぐ続く見出しを落とす", () => {
      expect(tidy("架空の根拠。\n\n## 架空の空の節")).toBe("架空の根拠。")
      expect(tidy("## 架空の空の節\n\n## 架空の節\n\n架空の本文。")).toBe(
        "## 架空の節\n\n架空の本文。",
      )
      expect(
        tidy(
          "## 架空の節\n\n架空の本文。\n\n### 架空の空の小節\n\n## 架空の次の節\n\n架空の本文。",
        ),
      ).toBe("## 架空の節\n\n架空の本文。\n\n## 架空の次の節\n\n架空の本文。")
    })

    it("文字の無い見出しは、中身が続いても落とす", () => {
      expect(tidy("##\n\n架空の本文。")).toBe("架空の本文。")
      expect(tidy("###   \n架空の本文。")).toBe("架空の本文。")
    })

    it("小見出しがみな空で落ちた節は、親の見出しも落とす", () => {
      expect(tidy("架空の根拠。\n\n## 架空の親\n\n### 架空の空の子")).toBe("架空の根拠。")
    })

    it("定型の行を落として空になった節は、見出しも落とす", () => {
      expect(tidy("架空の根拠。\n\n## 架空の締めの節\n\n以上です。")).toBe("架空の根拠。")
    })

    it("深い見出しが続く見出し・中身がフェンスや HTML の塊だけの見出しは落とさない", () => {
      const nested = "## 架空の親\n\n### 架空の子\n\n架空の本文。"
      const fenced = "## 架空の節\n\n```text\n架空のコード\n```"
      const details =
        "## 架空の節\n\n<details><summary>架空の要約</summary>\n\n架空の本文。\n\n</details>"
      const insideHtml = '<div class="card">\n\n## 架空の案\n\n</div>'

      expect(tidy(nested)).toBe(nested)
      expect(tidy(fenced)).toBe(fenced)
      expect(tidy(details)).toBe(details)
      expect(tidy(insideHtml)).toBe(insideHtml)
    })

    it("フェンス・引用の中の見出しの形は見出しとして扱わない", () => {
      const fenced = "```markdown\n## 架空の空の節\n```"
      const quote = "> ## 架空の空の節"

      expect(tidy(fenced)).toBe(fenced)
      expect(tidy(quote)).toBe(quote)
    })
  })

  it("落とした行の前後の空行は1つに詰め、残りの空行はそのままにする", () => {
    expect(
      tidy("架空の根拠その1。\n\n以上です。\n\n架空の根拠その2。\n\n\n架空の根拠その3。"),
    ).toBe("架空の根拠その1。\n\n架空の根拠その2。\n\n\n架空の根拠その3。")
  })

  it("閉じていないフェンスは末尾まで続くものとして扱う", () => {
    const body = "架空の根拠。\n\n```text\n以上です。\n## 架空の空の節"

    expect(tidy(body)).toBe(body)
  })
})
