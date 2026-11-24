// 触れるレポートの式で呼べる関数の表と、引数を読む補助。

import { sum } from "remeda"

import {
  integerOf,
  listOf,
  mapPairs,
  numberOf,
  numberText,
  textOf,
  tooMany,
  type ExprValue,
  type Scalar,
  type Site,
} from "./expression-value.ts"
import { andThen, collect, fail, ok, type Evaluated } from "./report-evaluated.ts"
import { MAX_EXPRESSION_LIST_LENGTH } from "./report-expression-parse.ts"

export type FunctionSpec = {
  readonly min: number
  readonly max: number
  readonly run: (args: readonly ExprValue[], site: Site) => Evaluated<ExprValue>
}

export const FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  range: {
    min: 2,
    max: 2,
    run: (args, site) =>
      andThen(argAs(args, 0, site, integerOf), (start) =>
        andThen(argAs(args, 1, site, integerOf), (end) => {
          if (end < start) {
            return fail("out-of-range", site.at, "range は from が to 以下です", site.run.origin)
          }
          if (end - start + 1 > MAX_EXPRESSION_LIST_LENGTH) return tooMany(site.at, site.run)
          return ok(Array.from({ length: end - start + 1 }, (_, j) => start + j))
        }),
      ),
  },
  min: {
    min: 2,
    max: 2,
    run: (args, site) =>
      mapArgPairs(args, site, (x, y) => withNumbers(x, y, site, (a, b) => Math.min(a, b))),
  },
  max: {
    min: 2,
    max: 2,
    run: (args, site) =>
      mapArgPairs(args, site, (x, y) => withNumbers(x, y, site, (a, b) => Math.max(a, b))),
  },
  round: {
    min: 1,
    max: 2,
    run: (args, site) =>
      andThen(arg(args, 0, site), (first) =>
        mapPairs(first, args[1] ?? 0, site.at, site.run, (value, d) =>
          andThen(digitsOf(d, site), (digits) =>
            andThen(numberOf(value, site), (number) => {
              const scale = 10 ** digits
              return ok(Math.round(number * scale) / scale)
            }),
          ),
        ),
      ),
  },
  fixed: {
    min: 2,
    max: 2,
    run: (args, site) =>
      mapArgPairs(args, site, (value, d) =>
        andThen(numberOf(value, site), (number) =>
          andThen(digitsOf(d, site), (digits) => ok(number.toFixed(digits))),
        ),
      ),
  },
  sum: {
    min: 1,
    max: 1,
    run: (args, site) => andThen(argAs(args, 0, site, numbersOf), (numbers) => ok(sum(numbers))),
  },
  len: {
    min: 1,
    max: 1,
    run: (args, site) =>
      andThen(arg(args, 0, site), (value) =>
        andThen(listOf(value, site), (list) => ok(list.length)),
      ),
  },
  minOf: {
    min: 1,
    max: 1,
    run: (args, site) =>
      andThen(argAs(args, 0, site, nonEmptyNumbers), (numbers) => ok(Math.min(...numbers))),
  },
  maxOf: {
    min: 1,
    max: 1,
    run: (args, site) =>
      andThen(argAs(args, 0, site, nonEmptyNumbers), (numbers) => ok(Math.max(...numbers))),
  },
  argmin: {
    min: 1,
    max: 1,
    run: (args, site) =>
      andThen(argAs(args, 0, site, nonEmptyNumbers), (values) =>
        ok(values.indexOf(Math.min(...values))),
      ),
  },
  argmax: {
    min: 1,
    max: 1,
    run: (args, site) =>
      andThen(argAs(args, 0, site, nonEmptyNumbers), (values) =>
        ok(values.indexOf(Math.max(...values))),
      ),
  },
  at: {
    min: 2,
    max: 2,
    run: (args, site) =>
      andThen(arg(args, 0, site), (value) =>
        andThen(listOf(value, site), (items) =>
          andThen(argAs(args, 1, site, integerOf), (position) => {
            const item = items[position]
            if (position < 0 || item === undefined) {
              return fail("out-of-range", site.at, "at の位置が並びの外です", site.run.origin)
            }
            return ok(item)
          }),
        ),
      ),
  },
  text: {
    min: 1,
    max: 2,
    run: (args, site) => {
      const suffix = args[1]
      const tail = suffix === undefined ? "" : textOf(suffix)
      return andThen(argAs(args, 0, site, numbersOf), (numbers) =>
        ok(numbers.map((value) => `${numberText(value)}${tail}`)),
      )
    },
  },
}

function arg(args: readonly ExprValue[], index: number, site: Site): Evaluated<ExprValue> {
  const value = args[index]
  return value === undefined
    ? fail("arity", site.at, "引数が足りません", site.run.origin)
    : ok(value)
}

/** 引数 `index` を `read`（`integerOf` など）で読む。 */
function argAs<T>(
  args: readonly ExprValue[],
  index: number,
  site: Site,
  read: (value: ExprValue, site: Site) => Evaluated<T>,
): Evaluated<T> {
  return andThen(arg(args, index, site), (value) => read(value, site))
}

/** 引数 0 と 1 を並びの要素ごとに（片方が並びなら全要素に）組み合わせる。 */
function mapArgPairs(
  args: readonly ExprValue[],
  site: Site,
  op: (x: Scalar, y: Scalar) => Evaluated<Scalar>,
): Evaluated<ExprValue> {
  return andThen(arg(args, 0, site), (a) =>
    andThen(arg(args, 1, site), (b) => mapPairs(a, b, site.at, site.run, op)),
  )
}

function withNumbers(
  x: Scalar,
  y: Scalar,
  site: Site,
  op: (a: number, b: number) => number,
): Evaluated<Scalar> {
  return andThen(numberOf(x, site), (a) => andThen(numberOf(y, site), (b) => ok(op(a, b))))
}

function digitsOf(value: Scalar, site: Site): Evaluated<number> {
  return andThen(integerOf(value, site), (digits) =>
    digits >= 0 && digits <= 20
      ? ok(digits)
      : fail("out-of-range", site.at, "桁数は 0〜20 です", site.run.origin),
  )
}

function numbersOf(value: ExprValue, site: Site): Evaluated<readonly number[]> {
  return andThen(listOf(value, site), (list) => collect(list, (item) => numberOf(item, site)))
}

function nonEmptyNumbers(value: ExprValue, site: Site): Evaluated<readonly number[]> {
  return andThen(numbersOf(value, site), (numbers) =>
    numbers.length > 0
      ? ok(numbers)
      : fail("out-of-range", site.at, "空の並びです", site.run.origin),
  )
}
