// コマンドラインの値（`--days 14` の `14`）を正の整数として読む。
import { z } from "zod"

export const positiveIntegerArgument = z
  .string()
  .transform(Number)
  .pipe(z.number().int().positive())
