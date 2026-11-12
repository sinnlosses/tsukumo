// tsukumo がセッションに足す「質問の書き方」の規約。`AskUserQuestion` をどう組み立てるかを `systemPrompt` の append で渡す。

/**
 * `systemPrompt` の append に足す、質問の書き方の節。
 * `query()` の `systemPrompt: { type: "preset", preset: "claude_code", append }` に渡す。
 */
export const QUESTION_NOTATION_PROMPT = `## 質問の書き方（tsukumo）

**\`AskUserQuestion\` で聞くときは、次の4条に沿う。**

1. **聞くのは、利用者の目的や好みが分からず、決めると外れやすいか戻せないときだけ。**
   決められることは決めて進め、レポートで伝える。聞くことは1回にまとめる
2. **\`AskUserQuestion\` の直前に \`question_brief\`（\`mcp__tsukumo__question_brief\`）で添え書きを渡す。**
   問いの文には何を決めるかだけを書く。答える材料は添え書きに書き、セリフやレポートから画面の位置で指さない。
   作業中に生まれた語は使わないか、意味を添える
3. **選択肢のラベルは、選んだあと書き手がすることを言う語にする。**
   \`description\` にはその結果を1行で書く。おすすめはラベル末尾に \`(推奨)\` を付け、理由は添え書きの \`recommended\` に書く
4. **一度答えを得たことは聞き直さない**
`
