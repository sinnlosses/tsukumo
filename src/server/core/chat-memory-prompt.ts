// 雑談の記憶（**それより前の要約**と**直近の逐語**）を `systemPrompt` に載せるかどうかを決め、
// 載せるときに添える前置きを組み立てる（`docs/design.md` 7章「雑談の記憶の要約はどこに置くか」、
// `docs/chat-mode.md` 4.9「直近の会話は逐語のまま読み戻す」）。`chat-manner.ts` の隣に置く
// （モデルに見せる文面は core 側）。
//
// **ターンの途中で `recall` が返す文面もここが組み立てる**（`docs/chat-mode.md` 4.9「古い雑談は
// 索引を引いて思い出す」）。載る場所は違う（`systemPrompt` か、ツールの戻り値か）が、**逐語の
// 並べ方（話者の印・日付の見出し）は同じ1つ**で、読む側が2通りを覚えずに済む。
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
// 呼び出すのは配線層（`src/session-start.ts`）で、**雑談のときしかこの関数を呼ばない**
// （仕事のときは呼ばずに空の配列を使う）ので、この関数自体は雑談であることを前提にしてよい。

import {
  type ChatArchive,
  type ChatArchiveRecentEntry,
  type ChatReadbackLimits,
  type ChatRecallResult,
  type ChatSummary,
  type SessionStart,
} from "./session-driver.ts"

/**
 * 要約の前置き。**要約であって会話ではないこと**と**引用しないこと**を短く添える
 * （`docs/chat-mode.md` 4.9「渡し方」）。**印の行はここに含めない**——{@link ChatSummary.read}
 * が返す `summary` はすでに印の行を含まない。
 */
const CHAT_SUMMARY_PREFACE =
  "## 前回までの雑談の要約\n\n" +
  "以下は claude 自身が `/compact` で作った、前回までの雑談の要約。会話そのものではなく、" +
  "そのままの引用でもない。踏まえてよいが、文面を読み上げたり引用したりしない。"

/**
 * 逐語の前置き。**要約と違って会話の文面そのもの**であることと、話者の見分け方を添える。
 * いつごろの話かは**日付が変わるところに `### <日付>` の見出しを挟む**ことで足りる
 * （`docs/chat-mode.md` 4.9。表情も画像の枚数も載せない）。見出しは会話の発言ではない
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
 * （`docs/chat-mode.md` 4.9「残すと決めた1往復は窓から落とさない」）。日付の見出しは
 * 直近と同じ形で挟むので、いつごろの話かはそれで読める。
 */
const CHAT_KEPT_PREFACE =
  "## 残すと決めた雑談（そのままの文面）\n\n" +
  "以下はあなた自身が `keep` で「残す」と決めた、過去の雑談のやり取りそのもの（要約ではない）。" +
  "**下の「直近の雑談」より前のもので、間には残っていない会話がある**（続きとして読まない）。" +
  "話者の見分け方と日付の見出しは下と同じ。踏まえてよいが、読み上げたり引用したりしない。"

/**
 * `recall` が当たったときの前置き（`docs/chat-mode.md` 4.9「古い雑談は索引を引いて思い出す」）。
 * **`systemPrompt` の3つと違って、これはツールの戻り値としてターンの途中で入る**ので、
 * **いまの話の続きではないこと**をここで断る。日付の見出しと話者の印は他の節と同じ。
 */
const CHAT_RECALL_PREFACE =
  "索引に当たった日の雑談そのもの（要約ではない）。" +
  "**いま話していることの続きではなく、引いた日のやり取りをそのまま抜いたもの**で、" +
  "前後には残っていない会話がある。`利用者:` が利用者の発言、`あなた:` があなた自身の過去のセリフ。" +
  "`### ` で始まる行は日付の見出しで、会話の発言ではない。" +
  "思い出した内容として踏まえてよいが、読み上げたり引用したりしない。"

/** 索引に当たる日が無かったときの戻り値。**どの日のファイルも開いていない。** */
const CHAT_RECALL_NOT_FOUND =
  "索引に当たる日が無かった。別の言葉で引き直すか、覚えていないことを正直に言う。"

/** そのターンで既に1回引いたときの戻り値（`docs/design.md` 7章の「1ターンに1回」）。 */
const CHAT_RECALL_ALREADY_RECALLED =
  "このターンではもう引けない（引けるのは1ターンに1回）。次のターンで引き直す。"

/** 逐語の1行の頭に置く話者の印。 */
const SPEAKER_LABEL = {
  user: "利用者",
  character: "あなた",
} as const satisfies Record<ChatArchiveRecentEntry["speaker"], string>

/** {@link takeChatMemoryPromptParts} に渡す口と条件。 */
export type ChatMemorySources = {
  /** 新規に起こすか、続きから始めるか（`SessionLaunchSeed.start`）。 */
  readonly start: SessionStart
  /**
   * 雑談の要約の写しの口。**呼ぶ側が雑談のときだけこの関数を呼ぶ**ので、ここには常に値がある
   * （仕事のときの「載せない」判断は呼ぶ側の1回の分岐に寄せてある）。
   */
  readonly chatSummary: ChatSummary
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
 * 1. **新規に起こす**（`start.kind` が `"new"`）
 * 2. 続きから始めるが、**写しの印が「未渡し」**
 *
 * どちらでもなければ載せない——続きから始めた文脈には同じ会話も同じ要約も既にある。
 * **印が無い・読めないときは「未渡し」として扱う**（倒れる方向を「同じものが2度載る」側にし、
 * 黙って記憶が消えるほうへ倒さない）。**載せたら印を「渡し済み」に戻す**（起こし直しのたびに
 * 重ねないため）。
 *
 * **写しがまだ無くても逐語は載る。** 条件を決めるのは `start` と印だけで、要約があるかどうか
 * ではない（`docs/chat-mode.md` 4.9）。
 *
 * **名前が `take` で始まるのは、返すだけでなく写しの印を書き換えるから**（2度目の呼び出しは
 * 同じ文面を返さない）。取得に見える名前にすると、呼ぶ側が副作用に気づけない。
 */
export function takeChatMemoryPromptParts(sources: ChatMemorySources): readonly string[] {
  const { chatSummary } = sources
  const record = chatSummary.read()
  const delivered = record?.delivered ?? false
  if (sources.start.kind === "resume" && delivered) {
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
 * `recall` の結果をモデルへ返す文面に変える（`src/server/adapter/sdk-driver.ts` の `recall`
 * ツールの戻り値）。**当たったときだけ逐語が入る**——当たらなかったときと、そのターンで既に
 * 引いたときは短い一言だけで、会話の文面は1バイトも入らない。
 *
 * **ここが「戻り値は `"ok"` だけ」の唯一の例外**（`docs/chat-mode.md` 4.9）。返しているのは
 * tsukumo の状態ではなく**その会話自身の過去**なので、`docs/architecture.md`「戻り値は `"ok"`
 * だけにする」が塞いでいる逆流路（tsukumo → モデル）は開かない。
 */
export function chatRecallText(result: ChatRecallResult): string {
  if (result.kind === "already-recalled") {
    return CHAT_RECALL_ALREADY_RECALLED
  }
  if (result.kind === "not-found") {
    return CHAT_RECALL_NOT_FOUND
  }
  return verbatimPart(CHAT_RECALL_PREFACE, result.entries) ?? CHAT_RECALL_NOT_FOUND
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
