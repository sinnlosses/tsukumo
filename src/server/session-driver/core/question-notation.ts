// tsukumo がセッションに足す「質問の書き方」の規約。`AskUserQuestion` をどう組み立てるかを `systemPrompt` の append で渡す。

/**
 * `systemPrompt` の append に足す、質問の書き方の節。
 * `query()` の `systemPrompt: { type: "preset", preset: "claude_code", append }` に渡す。
 */
export const QUESTION_NOTATION_PROMPT = `## 質問の書き方（tsukumo）

**\`AskUserQuestion\` で聞くときは、次の4条に沿う。**

1. **\`AskUserQuestion\` の直前に \`question_brief\`（\`mcp__tsukumo__question_brief\`）で添え書きを渡す。**
   背景（なぜ今聞くか。2〜3文）・判断の軸・選択肢ごとの良い点と悪い点・軸ごとの評価・戻せない印を書き、
   \`header\` と選択肢の \`label\` は続けて呼ぶ \`AskUserQuestion\` と同じ字にする。質問文には何を決めるかだけを書く
2. **選択肢のラベルは、選んだあと何が起きるかを言う語にする**（「〜する」の形）。
   違いの決め手は \`description\` に1行で書く
3. **おすすめを付けるなら、その理由を \`description\` の頭に1行で書く**
4. **見た目・画面の形・データやコードの構造を選ばせるときは、添え書きの各選択肢の \`figures\` に図
   （\`table\`・\`mermaid\`・\`code\`・\`image\` など）を必ず付ける。** 言葉で済む選択（はい／いいえ、順番）には付けない
`
