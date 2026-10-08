// Bash のコマンド文字列を、PreToolUse hook が判定に使える粒度の単純コマンドへ分ける。
// シェルの文法を完全には追わない。形が崩れていても投げずに、読めたところまでを返す。

/** 引用符を外した語。`expanded` は、変数・コマンド置換・`~` などシェルが展開する部分を含むか。 */
export type ShellWord = {
  readonly text: string
  readonly expanded: boolean
}

/** 区切り（`;` `&` `|` `(` `)` 改行）で分けた1つのコマンド。 */
export type SimpleCommand = {
  /** コマンド名とその引数。前置きの代入・`sudo`・`env`・`time`・予約語は外してある。 */
  readonly argv: readonly ShellWord[]
  /** 書き込みのリダイレクト（`>` `>>` `>|` `&>` `<>` など）の書き先。 */
  readonly writes: readonly ShellWord[]
  /** 読み込みのリダイレクト（`<`）の読み元。 */
  readonly inputs: readonly ShellWord[]
  /** 標準入力へ渡す heredoc の本文と here-string。 */
  readonly stdinTexts: readonly string[]
  /** 直前の区切りが `|` か `|&` で、前のコマンドの出力を標準入力に受けるか。 */
  readonly pipedIn: boolean
}

/**
 * コマンド文字列を、実行される順の単純コマンドへ分ける。
 * 引用符の外の `$(...)` とプロセス置換の中身、`sh` / `bash` / `zsh` の `-c` に渡したコードも同じように分けて含める。
 */
export function parseShellCommand(command: string): readonly SimpleCommand[] {
  return parseCommands(command).flatMap((parsed) => {
    const simple = toSimpleCommand(parsed)
    const inlineCode = shellDashCCode(simple.argv)
    return inlineCode === undefined ? [simple] : [simple, ...parseShellCommand(inlineCode)]
  })
}

type CommandBuilder = {
  readonly words: ShellWord[]
  readonly writes: ShellWord[]
  readonly inputs: ShellWord[]
  readonly stdinTexts: string[]
  readonly pipedIn: boolean
}

type PendingHeredoc = {
  readonly delimiter: string
  readonly stripsIndent: boolean
  readonly owner: CommandBuilder
}

type ReadWord = {
  readonly word: ShellWord
  readonly end: number
  readonly nested: readonly CommandBuilder[]
}

/** 前置きとして読み飛ばす語。後ろに本来のコマンドが続く。 */
const PREFIX_WORDS: ReadonlySet<string> = new Set([
  "!",
  "{",
  "}",
  "if",
  "then",
  "else",
  "elif",
  "while",
  "until",
  "do",
  "time",
  "nohup",
  "command",
  "exec",
])

/** 語の先頭にあるリダイレクトの演算子（数字の前置きを含む）。 */
const REDIRECT_OPERATOR = /^(\d*)(&>>|&>|>>|>\||>&|<<<|<<-|<<|<>|<&|>|<)/

const ASSIGNMENT = /^[A-Za-z_]\w*=/

const WORD_END = " \t\n;&|()<>"

const SHELLS_WITH_DASH_C: ReadonlySet<string> = new Set(["sh", "bash", "zsh"])

function parseCommands(command: string): readonly CommandBuilder[] {
  const commands: CommandBuilder[] = []
  let pending: PendingHeredoc[] = []
  let current = newBuilder()
  let index = 0

  const finish = (pipedIn = false): void => {
    if (current.words.length > 0 || current.writes.length > 0 || current.inputs.length > 0) {
      commands.push(current)
    }
    current = newBuilder(pipedIn)
  }

  while (index < command.length) {
    const character = command[index] ?? ""

    if (character === " " || character === "\t") {
      index += 1
      continue
    }
    if (character === "\\" && command[index + 1] === "\n") {
      index += 2
      continue
    }
    if (character === "\n") {
      finish()
      index = readHeredocBodies(command, index + 1, pending)
      pending = []
      continue
    }
    if (character === "#") {
      const lineEnd = command.indexOf("\n", index)
      index = lineEnd === -1 ? command.length : lineEnd
      continue
    }
    if (character === "(" && command[index + 1] === "(" && onlyPrefixWords(current.words)) {
      index = findClosingParen(command, index + 1) + 1
      while (command[index] === ")") {
        index += 1
      }
      continue
    }

    const redirect = REDIRECT_OPERATOR.exec(command.slice(index))
    const isProcessSubstitution =
      redirect !== null &&
      (redirect[2] === ">" || redirect[2] === "<") &&
      command[index + redirect[0].length] === "("
    if (redirect !== null && !isProcessSubstitution) {
      const operator = redirect[2] ?? ""
      const target = readWord(command, skipBlanks(command, index + redirect[0].length))
      commands.push(...target.nested)
      index = target.end
      if (operator === "<<" || operator === "<<-") {
        pending.push({
          delimiter: target.word.text,
          stripsIndent: operator === "<<-",
          owner: current,
        })
      } else if (operator === "<<<") {
        current.stdinTexts.push(target.word.text)
      } else if (operator === "<") {
        current.inputs.push(target.word)
      } else if (operator === "<&" || (operator === ">&" && /^(?:\d+|-)$/.test(target.word.text))) {
        // ファイル記述子の複製で、ファイルには書かない。
      } else {
        current.writes.push(target.word)
      }
      continue
    }

    if (character === "|" && command[index + 1] === "|") {
      finish()
      index += 2
      continue
    }
    if (character === "|") {
      finish(true)
      index += command[index + 1] === "&" ? 2 : 1
      continue
    }
    if (";&|()".includes(character)) {
      finish(character === "(" && current.words.length === 0 && current.pipedIn)
      index += 1
      continue
    }

    const read = readWord(command, index)
    commands.push(...read.nested)
    if (read.end === index) {
      index += 1
      continue
    }
    current.words.push(read.word)
    index = read.end
  }
  finish()
  return commands
}

function onlyPrefixWords(words: readonly ShellWord[]): boolean {
  return words.every((word) => PREFIX_WORDS.has(word.text))
}

function newBuilder(pipedIn = false): CommandBuilder {
  return { words: [], writes: [], inputs: [], stdinTexts: [], pipedIn }
}

/** 改行の直後から、待っている heredoc の本文を順に読み、持ち主のコマンドへ付ける。読み終えた位置を返す。 */
function readHeredocBodies(
  command: string,
  start: number,
  pending: readonly PendingHeredoc[],
): number {
  let index = start
  for (const heredoc of pending) {
    const lines: string[] = []
    let terminated = false
    while (index < command.length && !terminated) {
      const lineEnd = command.indexOf("\n", index)
      const end = lineEnd === -1 ? command.length : lineEnd
      const line = command.slice(index, end)
      index = lineEnd === -1 ? command.length : lineEnd + 1
      const compared = heredoc.stripsIndent ? line.replace(/^\t+/, "") : line
      if (compared === heredoc.delimiter) {
        terminated = true
      } else {
        lines.push(line)
      }
    }
    heredoc.owner.stdinTexts.push(lines.join("\n"))
  }
  return index
}

function readWord(command: string, start: number): ReadWord {
  let text = ""
  let expanded = false
  const nested: CommandBuilder[] = []
  let index = start

  while (index < command.length) {
    const character = command[index] ?? ""
    const next = command[index + 1]

    if ((character === "<" || character === ">") && next === "(") {
      const close = findClosingParen(command, index + 1)
      nested.push(...parseCommands(command.slice(index + 2, close)))
      text += command.slice(index, close + 1)
      expanded = true
      index = close + 1
      continue
    }
    if (WORD_END.includes(character)) {
      break
    }
    if (character === "'") {
      const close = command.indexOf("'", index + 1)
      const end = close === -1 ? command.length : close
      text += command.slice(index + 1, end)
      index = end + 1
      continue
    }
    if (character === '"') {
      const quoted = readDoubleQuoted(command, index + 1)
      text += quoted.text
      expanded ||= quoted.expanded
      index = quoted.end
      continue
    }
    if (character === "\\") {
      text += next ?? ""
      index += 2
      continue
    }
    if (character === "$" && next === "(") {
      const close = findClosingParen(command, index + 1)
      if (command[index + 2] !== "(") {
        nested.push(...parseCommands(command.slice(index + 2, close)))
      }
      text += command.slice(index, close + 1)
      expanded = true
      index = close + 1
      continue
    }
    if (character === "$" && next === "{") {
      const close = command.indexOf("}", index + 2)
      const end = close === -1 ? command.length : close + 1
      text += command.slice(index, end)
      expanded = true
      index = end
      continue
    }
    if (character === "`") {
      const close = command.indexOf("`", index + 1)
      const end = close === -1 ? command.length : close + 1
      text += command.slice(index, end)
      expanded = true
      index = end
      continue
    }
    if (character === "$" || (character === "~" && index === start)) {
      expanded = true
    }
    text += character
    index += 1
  }

  return { word: { text, expanded }, end: index, nested }
}

/** 二重引用符の中身を、開いた直後の位置から閉じる引用符まで読む。 */
function readDoubleQuoted(
  command: string,
  start: number,
): { readonly text: string; readonly expanded: boolean; readonly end: number } {
  let text = ""
  let expanded = false
  let index = start
  while (index < command.length && command[index] !== '"') {
    const character = command[index] ?? ""
    if (character === "\\" && index + 1 < command.length) {
      text += command[index + 1]
      index += 2
      continue
    }
    if (character === "$" || character === "`") {
      expanded = true
    }
    text += character
    index += 1
  }
  return { text, expanded, end: index + 1 }
}

/** `open` の位置の `(` に対応する `)` の位置。引用符の中の括弧は数えない。見つからなければ末尾。 */
function findClosingParen(command: string, open: number): number {
  let depth = 0
  let index = open
  while (index < command.length) {
    const character = command[index]
    if (character === "\\") {
      index += 2
      continue
    }
    if (character === "'") {
      const close = command.indexOf("'", index + 1)
      index = close === -1 ? command.length : close + 1
      continue
    }
    if (character === '"') {
      index = readDoubleQuoted(command, index + 1).end
      continue
    }
    if (character === "(") {
      depth += 1
    } else if (character === ")") {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
    index += 1
  }
  return command.length
}

function skipBlanks(command: string, start: number): number {
  let index = start
  while (command[index] === " " || command[index] === "\t") {
    index += 1
  }
  return index
}

function toSimpleCommand(parsed: CommandBuilder): SimpleCommand {
  return {
    argv: stripPrefixes(parsed.words),
    writes: [...parsed.writes],
    inputs: [...parsed.inputs],
    stdinTexts: [...parsed.stdinTexts],
    pipedIn: parsed.pipedIn,
  }
}

/** 本来のコマンドの前にある代入・予約語・`sudo` / `env` とその引数を外す。 */
function stripPrefixes(words: readonly ShellWord[]): readonly ShellWord[] {
  const [first, ...rest] = words
  if (first === undefined) {
    return words
  }
  if (PREFIX_WORDS.has(first.text) || ASSIGNMENT.test(first.text)) {
    return stripPrefixes(rest)
  }
  if (first.text === "sudo" || first.text === "env") {
    const commandAt = rest.findIndex(
      (word) => !word.text.startsWith("-") && !ASSIGNMENT.test(word.text),
    )
    return commandAt === -1 ? [] : stripPrefixes(rest.slice(commandAt))
  }
  return words
}

/** `sh` / `bash` / `zsh` の `-c` に渡したコード。 */
function shellDashCCode(argv: readonly ShellWord[]): string | undefined {
  const [name, ...args] = argv
  if (name === undefined || !SHELLS_WITH_DASH_C.has(baseName(name.text))) {
    return undefined
  }
  const flagAt = args.findIndex((word) => /^-[a-z]*c[a-z]*$/.test(word.text))
  return flagAt === -1 ? undefined : args[flagAt + 1]?.text
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}
