# 環境の実測値 2026-09-09

`docs/requirements.md` 5章から移した（2026-09-21。正典には**本質的な依存**と**未導入の一覧**
だけを残す。移した理由は同ファイル「正典に残すもの・`docs/history/` へ移すもの」）。

**この数字は古い。** 前提にする前にその場で確認すること。

- macOS (Darwin 25.6.0), zsh
- ターミナル: **Orca** v1.4.194（`com.stablyai.orca`。`TERM_PROGRAM=Orca`,
  `TERM=xterm-256color`）。VS Code 統合ターミナルも手元にはあるが、第一級ではない
- 導入済み: `bun` 1.3.8, `node` v22.13.1, `npm`, `pnpm`, `go` 1.26.5, `python3` 3.9.6,
  `jq`, ImageMagick（`magick`。**SIXEL の読み書きに対応**）, `ffmpeg`
- 未導入: `tmux`, `chafa`, `viu`, `timg`, `img2sixel`, `cowsay`, `deno`, `cargo`
- Claude Code v2.1.263 / outputStyle: `Asuna`

**2026-09-08 の記録からの差分**: `bun` は「未導入」だったが導入済みになった。ターミナルも
`TERM_PROGRAM=vscode` から `Orca` に変わっている。
