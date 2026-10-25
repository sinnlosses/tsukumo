// `claude -p --output-format json` の結果の JSON から、トークン・時間・拒否の回数を読む、という概念1つを持つ。外に触らない。
import { z } from "zod"

const claudeResultSchema = z.object({
  duration_ms: z.number(),
  permission_denials: z.array(z.unknown()),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_creation_input_tokens: z.number().default(0),
    cache_read_input_tokens: z.number().default(0),
  }),
})

export type ClaudeRunResult = {
  readonly tokens: number
  readonly durationMs: number
  readonly denials: number
}

/** 結果の JSON を読む。形が違えば例外を投げる。 */
export function parseClaudeResult(stdout: string): ClaudeRunResult {
  const result = claudeResultSchema.parse(JSON.parse(stdout))
  const { usage } = result
  return {
    tokens:
      usage.input_tokens +
      usage.output_tokens +
      usage.cache_creation_input_tokens +
      usage.cache_read_input_tokens,
    durationMs: result.duration_ms,
    denials: result.permission_denials.length,
  }
}
