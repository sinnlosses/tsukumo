// 雑談の記憶（**それより前の要約**と**直近の逐語**）を `systemPrompt` に載せるかどうかを決め、
// 載せるときに添える前置きを組み立てる（`docs/design.md` 7章「雑談の記憶の要約はどこに置くか」、
// `docs/requirements.md` 4.9「直近の会話は逐語のまま読み戻す」）。`chat-manner.ts` の隣に置く
// （モデルに見せる文面は core 側）。
//
// **判断は1箇所にまとめる。** 載せる条件は2つの記憶に共通で、載せたら写しの印を「渡し済み」に
// 戻す——2つの口に分けると、先に呼ばれたほうが印を戻して**あとの1つが黙って載らない**
// （`docs/design.md` 7章）。
//
// **中身を読んで判定しない。** 決めるのは「続きから始めないか」「写しの印が未渡しか」という
// 構造だけの条件で、要約の文面も逐語の文面も素通りする（読んで判定する経路を作ると
// `docs/coding-standards.md`「会話内容の扱い」とぶつかる。`docs/design.md` 7.1「覚えたことを
// 人格に書き足す」と同じ理由）。
//
// 口（`ChatSummary` / `ChatArchive`）の型は `src/server/core/session-driver.ts`、ファイルに触る
// 実装は `src/server/adapter/chat-summary.ts` と `src/server/adapter/chat-archive.ts`。
// 呼び出すのは配線層（`src/session-start.ts`）で、仕事のとき（`chatSummary` が undefined）は
// この関数自体が空を返すだけで、読みも書きも起きない。

import {
  type ChatArchive,
  type ChatArchiveRecentEntry,
  type ChatReadbackLimits,
  type ChatSummary,
} from "./session-driver.ts"

/**
 * 要約の前置き。**要約であって会話ではないこと**と**引用しないこと**を短く添える
 * （`docs/requirements.md` 4.9「渡し方」）。**印の行はここに含めない**——{@link ChatSummary.read}
 * が返す `summary` はすでに印の行を含まない。
 */
const CHAT_SUMMARY_PREFACE =
  "## 前回までの雑談の要約\n\n" +
  "以下は claude 自身が `/compact` で作った、前回までの雑談の要約。会話そのものではなく、" +
  "そのままの引用でもない。踏まえてよいが、文面を読み上げたり引用したりしない。"

/**
 * 逐語の前置き。**要約と違って会話の文面そのもの**であることと、話者の見分け方を添える。
 * いつごろの話かは**日付が変わるところに `### <日付>` の見出しを挟む**ことで足りる
 * （`docs/requirements.md` 4.9。表情も画像の枚数も載せない）。見出しは会話の発言ではない
 * ことをここで断る。
 */
const CHAT_RECENT_PREFACE =
  "## 直近の雑談（そのままの文面）\n\n" +
  "以下は直近の雑談のやり取りそのもの（要約ではない）。`利用者:` が利用者の発言、" +
  "`あなた:` があなた自身の過去のセリフ。`### ` で始まる行は日付の見出しで、会話の発言ではない。" +
  "続きとして踏まえてよいが、読み上げたり引用したりしない。"

/**
 * 旗の付いたやり取りの前置き。**直近と別の節に分けてある**ので、ここで断るのは
 * **時系列が続いていないこと**（直近より前で、間に抜けた会話がある）だけでよい
 * （`docs/requirements.md` 4.9「残すと決めた1往復は窓から落とさない」）。日付の見出しは
 * 直近と同じ形で挟むので、いつごろの話かはそれで読める。
 */
const CHAT_KEPT_PREFACE =
  "## 残すと決めた雑談（そのままの文面）\n\n" +
  "以下はあなた自身が `keep` で「残す」と決めた、過去の雑談のやり取りそのもの（要約ではない）。" +
  "**下の「直近の雑談」より前のもので、間には残っていない会話がある**（続きとして読まない）。" +
  "話者の見分け方と日付の見出しは下と同じ。踏まえてよいが、読み上げたり引用したりしない。"

/** 逐語の1行の頭に置く話者の印。 */
const SPEAKER_LABEL = {
  user: "利用者",
  character: "あなた",
} as const satisfies Record<ChatArchiveRecentEntry["speaker"], string>

/** {@link takeChatMemoryPromptParts} に渡す口と条件。 */
export type ChatMemorySources = {
  /** 続きから始めるセッションのID（`SessionLaunchSeed.resume`。新規なら undefined）。 */
  readonly resume: string | undefined
  /** 雑談の要約の写しの口。**undefined は仕事のとき**で、そのときは何も載らない。 */
  readonly chatSummary: ChatSummary | undefined
  /** 雑談の会話のアーカイブの口（読むのはここから起こすパックのぶんだけ）。 */
  readonly chatArchive: ChatArchive
  /** これから起こすキャラクターパックの名前。 */
  readonly packName: string
  /**
   * 逐語で読み戻す量（バイト。`CHAT_RECENT_READBACK_BYTES` と `CHAT_KEPT_READBACK_BYTES`）。
   */
  readonly readbackLimits: ChatReadbackLimits
}

/**
 * `systemPrompt` に足す、雑談の記憶ぶんの文面（載せないときは空。**古い→新しいの順**で、
 * 要約・旗の付いたやり取り・直近の逐語の3つ）。**旗のぶんを間に置くのは、直近より前だから**
 * （要約とどちらが古いかは決まらないが、逐語どうしの前後は決まる）。
 *
 * **載せる条件は2つで、どちらかに当たれば載せる**（`docs/design.md` 7章。**要約と逐語に共通**）:
 *
 * 1. **続きから始めない**（`resume` が undefined）
 * 2. 続きから始めるが、**写しの印が「未渡し」**
 *
 * どちらでもなければ載せない——`resume` した文脈には同じ会話も同じ要約も既にある。
 * **印が無い・読めないときは「未渡し」として扱う**（倒れる方向を「同じものが2度載る」側にし、
 * 黙って記憶が消えるほうへ倒さない）。**載せたら印を「渡し済み」に戻す**（起こし直しのたびに
 * 重ねないため）。
 *
 * **写しがまだ無くても逐語は載る。** 条件を決めるのは `resume` と印だけで、要約があるかどうか
 * ではない（`docs/requirements.md` 4.9）。
 *
 * **名前が `take` で始まるのは、返すだけでなく写しの印を書き換えるから**（2度目の呼び出しは
 * 同じ文面を返さない）。取得に見える名前にすると、呼ぶ側が副作用に気づけない。
 */
export function takeChatMemoryPromptParts(sources: ChatMemorySources): readonly string[] {
  const { chatSummary } = sources
  if (chatSummary === undefined) {
    return []
  }

  const record = chatSummary.read()
  const delivered = record?.delivered ?? false
  if (sources.resume !== undefined && delivered) {
    return []
  }

  const summary = record === undefined || record.summary === "" ? undefined : record.summary
  const readback = sources.chatArchive.readRecent(sources.packName, sources.readbackLimits)
  const kept = verbatimPart(CHAT_KEPT_PREFACE, readback.kept)
  const recent = verbatimPart(CHAT_RECENT_PREFACE, readback.recent)
  const parts = [
    ...(summary === undefined ? [] : [`${CHAT_SUMMARY_PREFACE}\n\n${summary}`]),
    ...(kept === undefined ? [] : [kept]),
    ...(recent === undefined ? [] : [recent]),
  ]
  if (parts.length === 0) {
    return []
  }

  chatSummary.markDelivered()
  return parts
}

/**
 * 逐語ぶんの1節（1件も無いときは undefined）。**日付が変わるところに `### <日付>` の
 * 見出しを挟む**（同じ日が続く間は見出しを重ねない。1日ぶんしか無ければ見出しは1つだけ）。
 * **並べ替えない** — `entries` は `readRecent` が返した順のまま並べるだけで、中身を読んで
 * 落としたり並べ替えたりしない。
 *
 * **旗の付いたぶんと直近で同じ組み立てを使う**（違うのは前置きだけ。並べ方が節によって
 * 変わると、読む側が話者の印と見出しを2通り覚えることになる）。
 */
function verbatimPart(
  preface: string,
  entries: readonly ChatArchiveRecentEntry[],
): string | undefined {
  if (entries.length === 0) {
    return undefined
  }

  const lines: string[] = []
  let lastDate: string | undefined
  for (const entry of entries) {
    if (entry.date !== lastDate) {
      lines.push(`### ${entry.date}`)
      lastDate = entry.date
    }
    lines.push(`${SPEAKER_LABEL[entry.speaker]}: ${entry.text}`)
  }
  return `${preface}\n\n${lines.join("\n")}`
}
