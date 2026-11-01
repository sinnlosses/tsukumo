// `pnpm run test:e2e` の引数を読み、`@playwright/test` 向けの引数に写す。

export type E2eArgument =
  | {
      readonly kind: "run"
      /** `.test.ts` で終わる位置引数。空なら全件。 */
      readonly files: readonly string[]
      readonly bail: number | undefined
      readonly maxWorkers: number | undefined
      readonly reporters: readonly string[]
      readonly jsonOutputFile: string | undefined
    }
  | { readonly kind: "unknown"; readonly arguments: readonly string[] }

const COUNT_FLAGS = ["--bail", "--maxWorkers"] as const

export function parseE2eArgument(args: readonly string[]): E2eArgument {
  const unknown = args.filter((arg) => !isKnown(arg))
  if (unknown.length > 0) {
    return { kind: "unknown", arguments: unknown }
  }
  return {
    kind: "run",
    files: args.filter((arg) => arg.endsWith(".test.ts")),
    bail: countOf(args, "--bail"),
    maxWorkers: countOf(args, "--maxWorkers"),
    reporters: valuesOf(args, "--reporter"),
    jsonOutputFile: valuesOf(args, "--outputFile.json").at(-1),
  }
}

export function playwrightArguments(
  argument: Extract<E2eArgument, { kind: "run" }>,
): readonly string[] {
  return [
    ...argument.files,
    ...(argument.bail === undefined ? [] : [`--max-failures=${String(argument.bail)}`]),
    ...(argument.maxWorkers === undefined ? [] : [`--workers=${String(argument.maxWorkers)}`]),
    argument.jsonOutputFile === undefined ? "--reporter=list" : "--reporter=list,json",
  ]
}

function isKnown(arg: string): boolean {
  if (arg.endsWith(".test.ts")) {
    return true
  }
  if (COUNT_FLAGS.some((flag) => arg.startsWith(`${flag}=`))) {
    return /^--[A-Za-z]+=\d+$/.test(arg)
  }
  return arg.startsWith("--reporter=") || arg.startsWith("--outputFile.json=")
}

function valuesOf(args: readonly string[], flag: string): readonly string[] {
  return args.filter((arg) => arg.startsWith(`${flag}=`)).map((arg) => arg.slice(flag.length + 1))
}

function countOf(args: readonly string[], flag: string): number | undefined {
  const value = valuesOf(args, flag).at(-1)
  return value === undefined ? undefined : Number(value)
}
