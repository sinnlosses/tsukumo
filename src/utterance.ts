// 1つの発話を「セリフ」と「詳細」に分ける。「決める」層で、ファイルI/Oを持たない。
//
// セリフの主経路は `speak` ツール（src/session-event.ts）で、ここはその補助。
// **`speak` が1度も呼ばれなかったターンだけ**、本文の行頭マーカーをセリフとして拾う
// （docs/requirements.md 4.2。呼び出しは src/session-view.ts の畳み込み）。

export type UtteranceParts = {
  readonly speech: string | undefined
  readonly detail: string
}

/** `speechMarker` の既定値（`docs/requirements.md` 4.2）。呼び出し側が差し替えないときに使う。 */
export const DEFAULT_SPEECH_MARKER = "アスナ: "

/**
 * 1つの発話を「セリフ」と「詳細」に分ける（`docs/requirements.md` 4.2、正典は
 * `~/.claude/output-styles/asuna.md`「セリフと詳細の書き分け」）。**規約はセリフを行頭の
 * マーカー（`speechMarker`。既定は「アスナ: 」）で始めることだけを決めており、tsukumo は
 * それを機械的に拾う**。マーカーは呼び出し側から受け取る（環境変数の読み取りは
 * `src/index.ts` に集約している）。コードブロック（``` で囲まれた範囲）の中の
 * マーカー行は拾わない。
 *
 * - **マーカーは行頭での完全一致だけを見る。** 行の途中に同じ文字列があっても拾わない
 * - **規約に従っていない発話（セリフが1つも無い）**: `speech` は `undefined` を返す。
 *   直前のセリフを出し続けるかどうかは表示側の責務なので、ここでは決めない
 *   （`docs/requirements.md` 4.2「吹き出しは直前のセリフを出し続ける」）
 * - **セリフが複数箇所に分かれているとき**: 出現順にすべて連結する。**セリフは役割
 *   （掛け声・リアクション・完了報告など）で書き分けられるものなので、後のセリフが前のセリフを
 *   上書きする理由が無い**。連続するマーカー行は改行で、離れたまとまりは空行を挟んでつなぐ
 * - `detail` は発話からセリフ行を除いた残り。セリフが無ければ発話の全文がそのまま `detail`
 *   になる。引用（`> `）はセリフではないので、詳細の中の普通の引用としてそのまま残る
 */
export function splitUtterance(utterance: string, speechMarker: string): UtteranceParts {
  const classified = classifyLines(utterance.split("\n"), speechMarker)

  return {
    speech: extractSpeech(classified, speechMarker),
    detail: extractDetail(classified),
  }
}

type ClassifiedLine = {
  readonly line: string
  readonly isSpeech: boolean
}

/**
 * 発話の各行に、セリフ行かどうかの印を付ける。コードブロック（``` で始まる行で開閉する範囲）の
 * 中は、マーカーで始まっていてもセリフ行として扱わない。
 */
function classifyLines(lines: readonly string[], speechMarker: string): readonly ClassifiedLine[] {
  const initial: { readonly inFence: boolean; readonly items: readonly ClassifiedLine[] } = {
    inFence: false,
    items: [],
  }

  const result = lines.reduce((acc, line) => {
    const isFenceDelimiter = line.trim().startsWith("```")
    const isSpeech = !isFenceDelimiter && !acc.inFence && line.startsWith(speechMarker)
    return {
      inFence: isFenceDelimiter ? !acc.inFence : acc.inFence,
      items: [...acc.items, { line, isSpeech }],
    }
  }, initial)

  return result.items
}

/**
 * セリフ行からマーカーを取り除き、まとまりごとに改行で、まとまり同士は空行でつないだ文字列を
 * 返す。
 */
function extractSpeech(
  classified: readonly ClassifiedLine[],
  speechMarker: string,
): string | undefined {
  const blocks = groupSpeechBlocks(classified, speechMarker)
  return blocks.length === 0 ? undefined : blocks.join("\n\n")
}

/** 連続するセリフ行を1つのまとまりにする。まとまりは出現順に並ぶ。 */
function groupSpeechBlocks(
  classified: readonly ClassifiedLine[],
  speechMarker: string,
): readonly string[] {
  const initial: { readonly blocks: readonly string[]; readonly current: readonly string[] } = {
    blocks: [],
    current: [],
  }

  const result = classified.reduce((acc, item) => {
    if (item.isSpeech) {
      return {
        blocks: acc.blocks,
        current: [...acc.current, stripSpeechMarker(item.line, speechMarker)],
      }
    }
    if (acc.current.length === 0) {
      return acc
    }
    return { blocks: [...acc.blocks, acc.current.join("\n")], current: [] }
  }, initial)

  return result.current.length === 0 ? result.blocks : [...result.blocks, result.current.join("\n")]
}

function stripSpeechMarker(line: string, speechMarker: string): string {
  return line.slice(speechMarker.length)
}

/** セリフ行を除いた残りの行を、発話中の順序のまま改行でつないだ文字列を返す。 */
function extractDetail(classified: readonly ClassifiedLine[]): string {
  return classified
    .filter((item) => !item.isSpeech)
    .map((item) => item.line)
    .join("\n")
}
