# fish 補完: sharkdp の tarball ダウンロードを削る

status: 完了
調査日: 2026-08-07

## 背景

`src/update/fish-completions.ts` の `sharkdp` recipe が、`bat` / `hyperfine` /
`pastel` の3本について GitHub のリリース tarball（バイナリ入り、数MB）を落とし、
その中の `.fish` 1ファイルだけ取り出して残りを捨てている。
「コマンド自身に補完を出させられないか」を調べた。

### 調査結果

| tool | 自前生成 | 根拠 |
|---|---|---|
| `bat` | **できる** | `bat --completion fish`。出力は tarball 内の物と**末尾の空行1つを除いて一致**（267行 vs 268行）を実測（bat 0.26.1） |
| `hyperfine` | できない | `build.rs` が `clap_complete::generate_to` でビルド時に生成。バイナリに generator 無し、repo に静的ファイル無し |
| `pastel` | できない | 同上（加えて man page も生成） |

`hyperfine` / `pastel` の `build.rs` はどちらも
`SHELL_COMPLETIONS_DIR` → `OUT_DIR` の順に環境変数を見て、そこへ
bash / zsh / fish / powershell（hyperfine は elvish も）を書き出す。
つまり**ビルド時にしか生成されない。**

`DOWNLOADS`（`curl` で単一ファイルを取る14本、eza / zoxide / ghq など）も
一通り `--help` を grep したが、generator を持つものは1本も無かった。
あちらは1ファイルの `curl` なので現状維持でよい。

## 調査中に見つかった、tarball より重い問題

`sharkdpChain()`（`src/update/fish-completions.ts:336-359`）は `fetch` を
**enqueue 時**に呼んでいる。つまり:

1. **`--dry-run` がネットワークを叩く。** 認証なしの GitHub API を3回。
   レート制限は IP あたり 60/hr で、他の用途と共有。
2. **失敗すると `throw` して `vup` 全体が死ぬ。** 補完1本の取得失敗ではなく、
   OS パッケージ更新も cargo も含めた実行全体が止まる。
3. **落としてくるのは「最新リリース」であって「入っているバイナリの版」ではない。**
   手元に無いバイナリの補完を書く可能性がある。
4. `x86_64-unknown-linux-gnu` がハードコード。`machineArch()`
   （`src/lib/platform.ts:31`）が既にあるのに使っていない。
5. 1本あたり pueue に4タスク（wget / tar / cp / rm）+ `/tmp` にゴミ。

## 方針

### 1. `bat` を `stdout` recipe へ移す

`INDIVIDUAL` に追加し、`SHARKDP_CMDS` から外す。

```ts
{
  requires: ["bat"],
  outputs: ["bat"],
  recipe: { kind: "stdout", argv: ["bat", "--completion", "fish"] },
},
```

→ tarball 1本、GitHub API 呼び出し1回、pueue タスク4本が消える。

### 2. `hyperfine` / `pastel` は tarball を残すが、形を変える

生成手段が無い以上ダウンロードは避けられない。代わりに上の 1〜5 を潰す。

- **版は GitHub API ではなく `<cmd> --version` から取る。**
  出力は `hyperfine 1.20.0` / `pastel 0.12.0` で、tag は `v` + それ。
  実測で installed == latest。これで enqueue 時のネットワークが**ゼロ**になり、
  `--dry-run` が完全にオフラインになる。補完も入っているバイナリと必ず一致する。
- **4タスクの chain を1タスクに畳む。** tarball 内のパスは決定的なので
  wildcard も要らない:

  ```
  curl -fsSL <url> | tar -xzO <archiveName>/autocomplete/<cmd>.fish > /tmp/<cmd>-completion.fish && mv /tmp/<cmd>-completion.fish <dest>
  ```

  temp file → `mv` にするのは、`claude` エントリ（同ファイル L124-131）が
  既に書いている理由と同じ。`>` を直接 dest に向けると、ダウンロード失敗時に
  空の補完ファイルが残る。
- **arch は `machineArch()` を使う。**

`sharkdpChain()` は `async` / `fetch` が要らなくなるので、同期関数
`sharkdpCommand(cmd: string): string` になる。`enqueue()` の `case "sharkdp"` は
`runChain` から `run` へ。

### 採らなかった案: `SHELL_COMPLETIONS_DIR` を cargo update に渡す

両 `build.rs` はこの環境変数を見るので、`cargo install-update` が再ビルドする
ついでに補完を書かせられる（ダウンロード完全消滅）。却下した理由:

- 更新が来たときにしか走らない。補完の鮮度が cargo の更新に人質に取られる
- `install-update` は多数の crate を1プロセスで回すので、同じ形の build.rs を持つ
  crate が全部そのディレクトリに書く。bash / zsh / ps1 / elvish / man page も
  一緒に落ちるので、temp dir + 選別コピーが要る
- cargo 以外の経路で入れたマシンでは効かない

得るもの（tarball 2本）に対して可動部が増えすぎる。

## 触るファイル

- `src/update/fish-completions.ts`
  - `INDIVIDUAL` に bat エントリを追加
  - `SHARKDP_CMDS` を `["hyperfine", "pastel"]` に
  - `sharkdpChain` → `sharkdpCommand`（同期・戻り値は1コマンド）
  - `enqueue()` の `case "sharkdp"` を `dispatch.run(...)` に変更
  - import に `machineArch`（`../lib/platform.ts`）を追加

`Recipe` 型の `sharkdp` variant はそのまま使える。

## ストリーム展開は検証済み

`curl … | tar -xzO <tarball内のフルパス>` は成立する（GNU tar 1.35 で実測）。
`--wildcards` は不要 — tarball 内のパスは
`<cmd>-v<version>-<arch>-unknown-linux-gnu/autocomplete/<cmd>.fish` で決定的。

```
curl -sfL https://github.com/sharkdp/pastel/releases/download/v0.12.0/pastel-v0.12.0-x86_64-unknown-linux-gnu.tar.gz \
  | tar -xzO pastel-v0.12.0-x86_64-unknown-linux-gnu/autocomplete/pastel.fish | wc -l
# => 145 （現行の ~/.config/fish/completions/pastel.fish と同じ行数）
```

hyperfine は同じ tarball 構造なので同様に通る想定。実装後に検証手順4で照合する。

## 検証

AGENTS.md の「移管の検証手順」に沿う。作業は worktree で行う
（`git worktree add ../scripts-fish-sharkdp <branch>`）。

1. **変更前の `vup --dry-run` を保存**
   `./vup.sh --dry-run > /tmp/before.txt 2>/tmp/before.err`
2. 変更後に同じものを取り、正規化して diff
   `sed -E 's/^pueue add (--after [^-]*)?-- //' | sort`
   期待される差分だけであること: bat の4行 → 1行、hyperfine / pastel の各4行 → 1行。
   それ以外の 140+ タスク・依存 47本は不変
3. **`--dry-run` がネットワークを叩かないことを確認。**
   現状は GitHub API が失敗すると例外で落ちる
4. **生成物の照合。** 3本それぞれ、現在の
   `~/.config/fish/completions/<cmd>.fish` を退避してから新方式のコマンドを
   手で実行し `diff`。bat は末尾空行1行差、hyperfine / pastel は完全一致のはず
5. `fish -c 'complete -C "hyperfine --"'` などで補完が実際に効くこと
6. `task check`（biome check --write → tsc --noEmit）
