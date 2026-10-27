// サブエージェントが打つ、外へ送る操作（GitHub への書き込み・git push）を見つける。

import type { BashDenial } from "./bash-denial.ts"
import type { BashHookCall } from "./bash-hook-call.ts"
import { isGitDryRunOption, splitGitArguments } from "./git-subcommand.ts"
import { baseName, parseShellCommand, stripPrefixes } from "./shell-command.ts"
import type { ShellWord } from "./shell-command.ts"

const REFUSAL = `外へ送る操作（GitHub への書き込み・push）は人の承認が要る。
委譲先では打たず、何を送りたいかを報告に書いてメインに預けること（一覧は docs/coding-standards/external-send.md）。`

const GH_WRITE_GROUPS: ReadonlySet<string> = new Set([
  "issue",
  "pr",
  "label",
  "release",
  "repo",
  "gist",
  "project",
  "secret",
  "variable",
  "workflow",
  "run",
  "cache",
  "ssh-key",
  "gpg-key",
])

const GH_READ_VERBS: ReadonlySet<string> = new Set([
  "list",
  "view",
  "status",
  "diff",
  "checks",
  "search",
  "download",
  "watch",
  "clone",
  "checkout",
])

/** `gh api` のオプションのうち、次の語を値として取るもの。 */
const API_VALUE_OPTIONS: ReadonlySet<string> = new Set([
  "-X",
  "--method",
  "-f",
  "--raw-field",
  "-F",
  "--field",
  "--input",
  "-H",
  "--header",
  "-q",
  "--jq",
  "-t",
  "--template",
  "--cache",
  "--hostname",
  "-p",
  "--preview",
])

const API_METHOD_OPTIONS: ReadonlySet<string> = new Set(["-X", "--method"])

const API_FIELD_OPTIONS: ReadonlySet<string> = new Set([
  "-f",
  "--raw-field",
  "-F",
  "--field",
  "--input",
])

type ApiToken =
  | { readonly kind: "positional"; readonly text: string }
  | { readonly kind: "flag"; readonly name: string }
  | { readonly kind: "option"; readonly name: string; readonly value: string }

/** サブエージェントの呼び出しが外へ送る操作を含めば、最初に当たった規則のキーで拒否を返す。 */
export function findExternalSendDenial(call: BashHookCall): BashDenial | undefined {
  if (!call.fromSubagent) {
    return undefined
  }
  for (const simple of parseShellCommand(call.command)) {
    const [name, ...rest] = stripPrefixes(simple.argv)
    if (name === undefined) {
      continue
    }
    const rule = findSendRule(baseName(name.text), rest)
    if (rule !== undefined) {
      return { hook: "deny-external-send", rule, refusal: REFUSAL }
    }
  }
  return undefined
}

function findSendRule(command: string, words: readonly ShellWord[]): string | undefined {
  if (command === "gh") {
    return findGhRule(words.map((word) => word.text))
  }
  if (command === "git") {
    const { subcommand, args } = splitGitArguments(words)
    return subcommand === "push" && !args.some(isGitDryRunOption) ? "git-push" : undefined
  }
  return undefined
}

function findGhRule(args: readonly string[]): string | undefined {
  const [group, verb] = args
  if (group === "api") {
    return isApiWrite(tokenizeApiArguments(args.slice(1))) ? "gh-api-write" : undefined
  }
  if (group === undefined || verb === undefined || !GH_WRITE_GROUPS.has(group)) {
    return undefined
  }
  return verb.startsWith("-") || GH_READ_VERBS.has(verb) ? undefined : "gh-write"
}

function tokenizeApiArguments(args: readonly string[]): readonly ApiToken[] {
  const [first, ...rest] = args
  if (first === undefined) {
    return []
  }
  if (!first.startsWith("-") || first === "-") {
    return [{ kind: "positional", text: first }, ...tokenizeApiArguments(rest)]
  }
  const inline = splitInlineValue(first)
  if (inline.kind === "option" || !API_VALUE_OPTIONS.has(inline.name)) {
    return [inline, ...tokenizeApiArguments(rest)]
  }
  const [value, ...afterValue] = rest
  return value === undefined
    ? [inline]
    : [{ kind: "option", name: inline.name, value }, ...tokenizeApiArguments(afterValue)]
}

/** `--method=POST` と `-XPOST` の形を、名前と値に分ける。 */
function splitInlineValue(option: string): Exclude<ApiToken, { kind: "positional" }> {
  if (option.startsWith("--")) {
    const equal = option.indexOf("=")
    return equal === -1
      ? { kind: "flag", name: option }
      : { kind: "option", name: option.slice(0, equal), value: option.slice(equal + 1) }
  }
  return option.length > 2
    ? { kind: "option", name: option.slice(0, 2), value: option.slice(2) }
    : { kind: "flag", name: option }
}

function isApiWrite(tokens: readonly ApiToken[]): boolean {
  const endpoint = tokens.find((token) => token.kind === "positional")
  const options = tokens.filter((token) => token.kind === "option")
  const fields = options.filter((token) => API_FIELD_OPTIONS.has(token.name))
  if (endpoint?.text === "graphql") {
    return fields.some(
      (field) =>
        field.name === "--input" ||
        field.value.includes("mutation") ||
        field.value.slice(field.value.indexOf("=") + 1).startsWith("@"),
    )
  }
  const method = options.findLast((token) => API_METHOD_OPTIONS.has(token.name))
  return method === undefined ? fields.length > 0 : method.value.toUpperCase() !== "GET"
}
