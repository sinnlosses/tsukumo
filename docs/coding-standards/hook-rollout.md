# コーディング規約: 新しい hook の足し方

ステータス: **正典**。入口は `docs/coding-standards.md`（規約の理由と例外の入口と、子のファイルの一覧）。

責務: ツールの呼び出しを拒む新しい hook を log-only から入れて block に上げる手順を持つ。
読む時: `scripts/hook/lib/` に拒む判定を足すとき、hook を block に上げるとき。
直す時: mode の読み方・記録の形・再生の台本を変えたとき。

## 新しい hook は log-only から入れる

block で入れた hook は、誤って拒む形が後から見つかる（`deny-sed-in-place` のまれな形がそうだった）。
新しい判定は log-only で入れ、7日走らせた記録を再生して、誤検知が無いと見てから block に上げる。

1. 判定を `scripts/hook/lib/` に足し、`scripts/hook/bash-guard.ts` の `DENIALS` と `scripts/hook/lib/bash-denial.ts` の `BASH_GUARD_HOOKS` に並べる。
   Bash 以外のツールに掛ける判定は、単独の入口 `scripts/hook/deny-<名前>.ts` を置き、`.claude/settings.json` の `PreToolUse` にそのツールの matcher で登録する（`hook-denial-tally.ts` は `deny-*` の入口をそのまま拾う）
2. `scripts/hook/lib/hook-mode.ts` の `LOG_ONLY_HOOKS` に hook の名前を足す。この間、判定は当たってもツールの実行を止めず、
   `hook-denials/` に `mode: "log-only"` の行を残す（試すだけなら環境変数 `TSUKUMO_HOOK_LOG_ONLY` にカンマ区切りで名前を渡す）
3. 7日走らせてから `node scripts/hook/hook-denial-replay.ts [--days N]`（既定7）を打つ。拒むはずだった形が
   hook の名前と規則のキーごとに、件数・呼び手の内訳・最初と最後の時刻つきで並ぶ
4. 並んだ形が、本当に拒みたいものだけか確かめる。記録にコマンドの全文は無いので、疑わしい規則のキーは
   その時刻の前後の作業を人が見て当てる。誤検知があれば判定を直し、log-only のまま日数を数え直す
5. 誤検知が無ければ `LOG_ONLY_HOOKS` から名前を外して block に上げる

`hook-denial-tally.ts` の拒否の回数には log-only の行を数えない（拒んでいないため）。
