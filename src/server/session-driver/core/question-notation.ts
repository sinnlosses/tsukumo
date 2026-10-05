// tsukumo がセッションに足す「質問の書き方」の規約。`AskUserQuestion` をどう組み立てるかを `systemPrompt` の append で渡す。

/**
 * `systemPrompt` の append に足す、質問の書き方の節。
 * `query()` の `systemPrompt: { type: "preset", preset: "claude_code", append }` に渡す。
 */
export const QUESTION_NOTATION_PROMPT = `## 質問の書き方（tsukumo）

**\`AskUserQuestion\` で聞くときは、次の4条に沿う。**

1. **質問文の前に「なぜ今聞くのか」を1行で置く。** 背景が長いなら、本文はレポートに書き、
   質問ではそこを指すだけにする
2. **選択肢のラベルは、選んだあと何が起きるかを言う語にする**（「〜する」の形）。
   違いの決め手は \`description\` に1行で書く
3. **おすすめを付けるなら、その理由を \`description\` の頭に1行で書く**
4. **見た目・画面の形・データやコードの構造を選ばせるときは、各選択肢の \`preview\` に図
   （表・mermaid・svg・diff のコード）を必ず付ける。** 言葉で済む選択（はい／いいえ、順番）には付けない
   \`preview\` には手元の画像（作業ツリーの中の png など）も \`![説明](パス)\` で書ける。
   外部 URL と \`data:\` は描かれない
`
