// コマンドラインの値（`--scroll-element sel 40` の `40`）を 0 以上の整数として読む。
import { z } from "zod"

export const nonNegativeIntegerArgument = z.string().regex(/^\d+$/).transform(Number)
