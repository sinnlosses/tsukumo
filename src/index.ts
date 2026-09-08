// tsukumo のエントリポイント。transcript の追従と描画はまだ入っていない。

const USAGE = `tsukumo — Claude Code の発話を立ち絵と吹き出しで表示するサイドカー

使い方:
  bun run start <transcript.jsonl>
`

/**
 * 終了コードを返す。追従と描画は未実装なので、今は引数の有無だけを見る。
 */
function main(args: readonly string[]): number {
  if (args.length === 0) {
    process.stderr.write(USAGE)
    return 2
  }

  process.stderr.write("tsukumo: 追従と描画はまだ実装されていない\n")
  return 1
}

process.exit(main(process.argv.slice(2)))
