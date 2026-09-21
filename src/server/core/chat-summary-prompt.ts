// 雑談の要約（`chatSummary`）を `systemPrompt` に載せるかどうかを決め、載せるときに添える
// 前置きを組み立てる（`docs/design.md` 7章「雑談の記憶の要約はどこに置くか」）。`chat-manner.ts`
// の隣に置く（モデルに見せる文面は core 側。`docs/requirements.md` 4.9「記憶の圧縮と忘却」）。
//
// **写しの中身を読んで判定しない。** 決めるのは「続きから始めないか」「写しの印が未渡しか」と
// いう構造だけの条件で、要約の文面そのものは素通りする（読んで判定する経路を作ると
// `docs/coding-standards.md`「会話内容の扱い」とぶつかる。`docs/design.md` 7.1「覚えたことを
// 人格に書き足す」と同じ理由）。
//
// 口（`ChatSummary`）の型は `src/server/core/session-driver.ts`、ファイルに触る実装は
// `src/server/adapter/chat-summary.ts`。呼び出すのは配線層（`src/session-start.ts`）で、
// 仕事のとき（`chatSummary` が undefined）はこの関数自体が undefined を返すだけで、読みも
// 書きも起きない。

import { type ChatSummary } from "./session-driver.ts"

/**
 * 前置き。**要約であって会話ではないこと**と**引用しないこと**を短く添える
 * （`docs/requirements.md` 4.9「渡し方」）。**印の行はここに含めない**——{@link ChatSummary.read}
 * が返す `summary` はすでに印の行を含まない。
 */
const CHAT_SUMMARY_PREFACE =
  "## 前回までの雑談の要約\n\n" +
  "以下は claude 自身が `/compact` で作った、前回までの雑談の要約。会話そのものではなく、" +
  "そのままの引用でもない。踏まえてよいが、文面を読み上げたり引用したりしない。"

/**
 * `systemPrompt` に足す、雑談の要約ぶんの文面（載せないときは undefined）。
 *
 * **載せる条件は2つで、どちらかに当たれば載せる**（`docs/design.md` 7章）:
 *
 * 1. **続きから始めない**（`resume` が undefined）
 * 2. 続きから始めるが、**写しの印が「未渡し」**
 *
 * **印が無い・読めないときは「未渡し」として扱う**（倒れる方向を「同じ要約が2度載る」側にし、
 * 黙って記憶が消えるほうへ倒さない）。**載せたら印を「渡し済み」に戻す**（同じ写しを起こし
 * 直しのたびに重ねないため）。
 *
 * `chatSummary` が undefined（＝仕事のとき）は、常に undefined を返すだけで
 * {@link ChatSummary.read} も {@link ChatSummary.markDelivered} も呼ばない。
 *
 * **名前が `take` で始まるのは、返すだけでなく写しの印を書き換えるから**（2度目の呼び出しは
 * 同じ文面を返さない）。取得に見える名前にすると、呼ぶ側が副作用に気づけない。
 */
export function takeChatSummaryPromptPart(
  resume: string | undefined,
  chatSummary: ChatSummary | undefined,
): string | undefined {
  if (chatSummary === undefined) {
    return undefined
  }

  const record = chatSummary.read()
  const delivered = record?.delivered ?? false
  const shouldLoad = resume === undefined || !delivered
  if (!shouldLoad || record === undefined || record.summary === "") {
    return undefined
  }

  chatSummary.markDelivered()
  return `${CHAT_SUMMARY_PREFACE}\n\n${record.summary}`
}
