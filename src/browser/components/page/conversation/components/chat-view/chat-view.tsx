// 雑談ビュー（<ChatView>。docs/screen-design.md 13.7）の**入口**。**雑談モードの間だけ、メインビューの
// 場所に出る**（入れ替えるのは入口の `src/browser/main.tsx`）。ロジックは `hooks/use-chat-view.ts`
// が持ち、見た目は `presentational-chat-view.tsx` が持つ（docs/design.md 2章「機能の中を分ける」の
// container / presenter）。
//
// **仕事のときのメインビュー（`components/page/conversation/components/main-view/`）とは並びの規則が違う**ので、部品を分けて
// ある: あちらは依頼を境目にやり取りへまとめてタブで遡り、こちらは素直な時系列で積む。
//
// 雑談ビューが持つ振る舞いと、それぞれの置き場所（決め方はすべて docs/screen-design.md 13.7）:
//
// - **過去のセリフの行を押すと、そのときの表情へ立ち絵が遡る**。遡る先が「ターン」ではなく
//   「1件のセリフ」なのは、雑談のログが依頼で区切られていないため。**印は「立ち絵がいま従って
//   いる行」に付き、既定では最新のセリフに付いている**。**遡るのは押したときだけ**で、行に
//   載せただけでは立ち絵は動かない。**立ち絵の動きは遡らない**（キャラビューと同じ）。
//   決めるのは `hooks/use-chat-view.ts`、押し方の読み替えは `hooks/use-chat-speech.ts`
// - **セリフは全文でポンと現れ、キャラクターの吹き出しどうしは最低2秒空ける**
//   （`hooks/use-speech-reveal.ts`）。**サーバの契約は変えていない** — 1件まるごと届いたセリフを、
//   出すタイミングだけブラウザ側で持たせる
// - **返事を待っている間・まだ出していない吹き出しが控えている間はログの末尾に「...」を出す**
//   （`components/chat-typing.tsx`）
// - **発言の脇に時刻（`HH:MM`）を添え、日が変わるところに日付の区切りを1本入れる**
//   （`components/chat-time.tsx` / `components/chat-day.tsx`。文字は `hooks/use-chat-view.ts` が組む）
// - **下端付近を読んでいたときだけ最新へ寄せる**（`hooks/use-stick-to-bottom.ts`）
// - **立ち絵をつつくと話しかけてくれる**（`components/nudge-portrait.tsx`）
//
// ここに残すのは「フックを呼んで、受け取ったものを渡す」だけ。**条件分岐も算出もここには
// 置かない**（増えたらフックか見た目のどちらかに寄せる）。

import { type ReactElement } from "react"

import { useChatView } from "./hooks/use-chat-view.ts"
import { PresentationalChatView } from "./presentational-chat-view.tsx"

export function ChatView(): ReactElement {
  return <PresentationalChatView {...useChatView()} />
}
