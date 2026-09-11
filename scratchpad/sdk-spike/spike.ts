// 使い捨てのスパイク。Agent SDK で claude を起こし、方針の前提を1点ずつ確かめる。
//   bun spike.ts init       … 出力スタイルが効くか（init の output_style と応答の口調）
//   bun spike.ts speak      … speak ツールが呼ばれるか
//   bun spike.ts perm       … 許可要求が canUseTool に届くか（permissionMode: default）
//   bun spike.ts ask        … AskUserQuestion が canUseTool に届き、答えを返せるか
//   bun spike.ts interrupt  … 実行中の中断と、そのあとの追加入力
// 会話の中身はこの端末に出すだけで、ファイルには書かない。

import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

const phase = process.argv[2] ?? "init"
const cwd = import.meta.dirname

const speakCalls: { text: string; expression: string }[] = []
const tsukumo = createSdkMcpServer({
  name: "tsukumo",
  version: "0.0.0",
  tools: [
    tool(
      "speak",
      "キャラクターがユーザーに向けて話す。セリフ（短い一言）と表情を渡す。レポートや説明は本文に書き、ここには入れない。",
      {
        text: z.string().describe("セリフ。1〜2文の短い一言"),
        expression: z.enum(["default", "working", "proud", "flustered"]).describe("表情"),
      },
      async (args) => {
        speakCalls.push(args)
        console.log(`  [speak] expression=${args.expression} text=${JSON.stringify(args.text)}`)
        return { content: [{ type: "text", text: "ok" }] }
      },
    ),
  ],
})

// ストリーミング入力: push で追加、end で閉じる。
function makeInput() {
  const queue: string[] = []
  let notify: (() => void) | undefined
  let closed = false
  const wake = () => {
    notify?.()
    notify = undefined
  }
  return {
    push(text: string) {
      queue.push(text)
      wake()
    },
    end() {
      closed = true
      wake()
    },
    async *stream() {
      while (true) {
        if (queue.length === 0) {
          if (closed) return
          await new Promise<void>((resolve) => {
            notify = resolve
          })
          continue
        }
        const text = queue.shift()!
        yield {
          type: "user" as const,
          message: { role: "user" as const, content: text },
          parent_tool_use_id: null,
          session_id: "",
        }
      }
    },
  }
}

const prompts: Record<string, string> = {
  init: "自己紹介を一言でお願い。ツールは使わないで。",
  speak:
    "このセッションでは、ユーザーに向けたセリフ（掛け声・呼びかけ・感想・完了報告）は必ず mcp__tsukumo__speak ツールで言ってください。説明は本文に書きます。では、着手の一言を speak で言ってから、1+1 を計算して本文で答え、最後に完了報告を speak で言ってください。",
  perm: "Bash ツールで `touch perm-test.txt && rm perm-test.txt` を実行して、成功したかだけ教えて。",
  ask: "AskUserQuestion ツールを使って、私の好きな色を「赤」「青」の2択で聞いてください。答えが返ったら、その色をそのまま本文で復唱してください。",
  interrupt:
    "1 から 200 まで、1行に1つずつ、ゆっくり数えて本文に書いてください。途中で止めません。",
}

const input = makeInput()
input.push(prompts[phase] ?? prompts.init)

let permissionCount = 0
const q = query({
  prompt: input.stream(),
  options: {
    cwd,
    includePartialMessages: true,
    permissionMode: phase === "perm" || phase === "ask" ? "default" : "auto",
    mcpServers: { tsukumo },
    stderr: (data) => {
      if (data.trim() !== "") console.log(`  [stderr] ${data.trim().slice(0, 200)}`)
    },
    canUseTool: async (toolName, toolInput, options) => {
      permissionCount += 1
      console.log(
        `  [canUseTool] #${permissionCount} tool=${toolName} inputKeys=${JSON.stringify(Object.keys(toolInput))} suggestions=${options.suggestions?.length ?? 0}`,
      )
      if (toolName === "AskUserQuestion") {
        const questions = (
          toolInput as {
            questions: {
              question: string
              header: string
              options: { label: string }[]
              multiSelect?: boolean
            }[]
          }
        ).questions
        for (const question of questions) {
          console.log(
            `    question header=${JSON.stringify(question.header)} multiSelect=${String(question.multiSelect)} options=${JSON.stringify(question.options.map((o) => o.label))}`,
          )
        }
        const answers: Record<string, string> = {}
        for (const question of questions) {
          answers[question.question] = question.options[0]?.label ?? ""
        }
        console.log(`    answering with first options: ${JSON.stringify(answers)}`)
        return { behavior: "allow", updatedInput: { questions, answers } }
      }
      return { behavior: "allow", updatedInput: toolInput }
    },
  },
})

let streamEvents = 0
let textDeltaChars = 0
let interruptSent = false
let interruptDone = false
let turnDeltaChars = 0
const startedAt = Date.now()

for await (const message of q) {
  if (message.type === "system" && message.subtype === "init") {
    console.log("[init]")
    console.log(
      `  model=${message.model} permissionMode=${message.permissionMode} output_style=${JSON.stringify(message.output_style)}`,
    )
    console.log(
      `  claude_code_version=${message.claude_code_version} apiKeySource=${message.apiKeySource}`,
    )
    console.log(
      `  slash_commands=${message.slash_commands.length} sample=${JSON.stringify(message.slash_commands.filter((c) => /next-task|plan-tasks|code-review|loop|clear|model|compact/.test(c)))}`,
    )
    console.log(
      `  terminal_slash_commands=${JSON.stringify(message.terminal_slash_commands ?? [])}`,
    )
    console.log(
      `  skills=${message.skills.length} mcp_servers=${JSON.stringify(message.mcp_servers)}`,
    )
    console.log(`  tools has speak: ${message.tools.some((t) => t.includes("speak"))}`)
    continue
  }
  if (message.type === "stream_event") {
    streamEvents += 1
    const event = message.event as { type: string; delta?: { type?: string; text?: string } }
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      textDeltaChars += event.delta.text?.length ?? 0
      turnDeltaChars += event.delta.text?.length ?? 0
      if (phase === "interrupt" && !interruptDone && turnDeltaChars > 60) {
        interruptDone = true
        interruptSent = true
        console.log(
          `  [interrupt] sending at ${textDeltaChars} chars, t=${Date.now() - startedAt}ms`,
        )
        void q.interrupt().then((receipt) => {
          console.log(`  [interrupt] receipt=${JSON.stringify(receipt)?.slice(0, 120)}`)
        })
      }
    }
    continue
  }
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "text") {
        console.log(`[assistant text] (${block.text.length} chars)\n${block.text}`)
      } else if (block.type === "tool_use") {
        console.log(
          `[assistant tool_use] name=${block.name} inputKeys=${JSON.stringify(Object.keys(block.input as object))}`,
        )
      } else {
        console.log(`[assistant ${block.type}]`)
      }
    }
    continue
  }
  if (message.type === "user") {
    const content = message.message.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result") {
          const text =
            typeof block.content === "string" ? block.content : JSON.stringify(block.content)
          console.log(
            `[tool_result] is_error=${String(block.is_error)} (${text.length} chars) ${text.slice(0, 80)}`,
          )
        }
      }
    }
    continue
  }
  if (message.type === "result") {
    console.log(
      `[result] subtype=${message.subtype} turns=${message.num_turns} duration=${message.duration_ms}ms cost=$${message.total_cost_usd?.toFixed(4)}`,
    )
    turnDeltaChars = 0
    if (phase === "interrupt" && interruptSent) {
      console.log("  sending follow-up after interrupt")
      input.push("止めてくれてありがとう。いま何まで数えた？一言で。")
      interruptSent = false
      continue
    }
    input.end()
    continue
  }
  console.log(`[${message.type}${"subtype" in message ? "/" + String(message.subtype) : ""}]`)
}

console.log(
  `\nstream_events=${streamEvents} text_delta_chars=${textDeltaChars} speak_calls=${speakCalls.length} canUseTool_calls=${permissionCount}`,
)
