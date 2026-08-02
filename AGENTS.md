# AGENTS.md

`mimikun/mimikun.scripts` — セットアップ用スクリプト置き場。

このファイルが実体で、`CLAUDE.md` はここを import しているだけ。
エージェント向けの指示を足すときは、必ずこちら側を編集する。

## 実装は `src/**` の TypeScript、実行は bun

bash / PowerShell / fish に分散していた同じ処理を、ここに1本化している最中。
**新しい処理は `src/**` に TypeScript で書く。`.sh` に足さない。**

nushell も候補だったが見送った（2026-08-02）。行数の多い処理が
「コマンド → 生成パターン」の対応表や pueue の依存グラフといった**データ構造の問題**で、
型が効くほうが利く。加えて nushell は 0.x でほぼ毎月破壊的変更があり、
毎日走らせるスクリプトの置き場としてはリスクが勝った。

- `src/lib/` — 共有部分。**OS 差・外部コマンド呼び出しはここに閉じる**
  - `platform.ts` パッケージリストのパス（`linux_*` / `windows_*` の差はここだけ。
    OS をまたいで同じものは `sharedPkgListPath()`）
  - `cmd.ts` `commandExists()` / `envVarSet()`
  - `pueue.ts` `pueue add` の薄いラッパー。`TaskId` は branded type
  - `runner.ts` `--no-pueue` / `--dry-run` / `--serial` / `--after` の解釈と実行
  - `cargo.ts` `cargo install-update --list` の唯一のパーサ
  - `fish.ts` fish 補完の置き場
- `src/{generate,install,update}/` — 実行可能スクリプト。`#!/usr/bin/env bun`
- ルートの `*.sh` は**オーケストレータとして残す**。移管済みの部分は TS を呼ぶだけにし、
  未移管の部分だけ bash のまま置いておく。1歩ずつ差し替えて、各段階で戻せる状態を保つ

新しいスクリプトには必ず `--dry-run` を持たせる。移管の前後で
「積まれるコマンド集合が変わっていないこと」を差分で確認するため。
**そのため stdout に出すのは積まれるコマンドだけ。進捗・警告・スキップの通知は
stderr へ出す**（`note()` がそうしている）。混ぜると差分が取れなくなる。

呼び出し側ごとに pueue の積み方が違うことがある。**その違いはフラグで表現し、
実装を分けない。** 現状 `--serial`（各タスクが前のタスクを待つ。cargo のビルドを
1本ずつ流す）と `--after <id>`（外から渡された依存を待つ）の2つ。

**コミット前に `task check` を通す**（`biome check --write` → `tsc --noEmit`）。
個別に回すなら `task lint` / `task fix` / `task typecheck`。

### `~/.claude/rules/typescript.md` から意図的に外している点

グローバルのルールは prettier + eslint と pnpm を指定しているが、この repo は次の2点で外れる。
**グローバル側は変えていない**（他プロジェクトの既定として妥当なため）。

- **formatter / linter は biome。** TS は8ファイル・331行で、React も型情報を使う lint も要らない。
  prettier + eslint の2ツール構成は設定ファイルと依存が増えるだけで見合わない
- **パッケージマネージャは bun。** ここは bun をランタイムとして選んだ repo なので、
  インストーラだけ pnpm にする理由がない

### 呼び出し元

移管済みの処理は、外から**シム経由でここを呼ぶ**。シムには実装を書かない。

- **Linux**: chezmoi の `private_dot_local/bin/executable_*` → `~/.local/bin` に配備。
  リポジトリの場所は `${MIMIKUN_SCRIPTS_DIR:-$HOME/scripts}`
- **Windows / pwsh**: chezmoi の `dot_config/powershell/Microsoft.PowerShell_profile.ps1.tmpl` の
  `Invoke-MimikunCargoScript`。同じ環境変数で解決する
- ルートの `*.sh`（`generate.sh` / `install.sh` / `vup.sh`）

**シム側の変更は chezmoi のソースを編集して `chezmoi apply`。** 配備先を直接編集すると drift になる。

移管済み: パッケージリストの生成（9種）と導入（8種）、cargo の update、fish 補完。

**補完やパッケージのような「対象が増え続けるもの」は表にする。**
`src/update/fish-completions.ts` がその形。ツールを足す作業が
配列に名前を1つ書くことになり、`if` を1ブロック増やすことにならない。

### 移管元（まだ残っている重複）

未移管の処理は、今もここ以外に実装がある。移管するときは**こちらを正として読む**こと。

- chezmoi の `private_dot_local/bin/executable_*` — 移管済み以外の25本
- chezmoi の PowerShell プロファイル — cargo 以外の関数
- `mimikun/mimikun.sh` の `src/**` と `powershell/**` は**どこからも読み込まれていない死んだコピー**。
  2026-02 以降動いておらず chezmoi 側と乖離している。移管が済み次第あちらから削除し、最終的にアーカイブする

## Agent skills

### Issue tracker

Issue は GitHub Issues（`mimikun/mimikun.scripts`）で管理し、`gh` CLI で操作する。
See `docs/agents/issue-tracker.md`.

### Triage labels

デフォルトの5ラベル（`needs-triage` / `needs-info` / `ready-for-agent` /
`ready-for-human` / `wontfix`）をそのまま使う。
See `docs/agents/triage-labels.md`.

### Domain docs

single-context — ルートの `CONTEXT.md` と `docs/adr/`。どちらも未作成でよい。
See `docs/agents/domain.md`.
