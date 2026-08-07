# mimikun.scripts

セットアップ用スクリプト置き場です。実装は `src/**` の TypeScript、実行は [Bun](https://bun.sh/) で行います。初回に `bun install` が必要です。タスクの実行基盤には [pueue](https://github.com/Nukesor/pueue) を使います。

## 使い方

ルートの3本は、`src/**` を呼び出す薄いラッパーです。

| コマンド | 何をするか |
| --- | --- |
| `./vup.sh` | 全部更新します。`sudo -v` を取得してから `src/update/all.ts` を実行します。 |
| `./generate.sh` | インストール済みパッケージを一覧ファイルへ書き出し、`gup export` を実行します。 |
| `./install.sh` | 一覧ファイルからパッケージを入れ直し、`gup import` を実行します。Arch の一覧は TTY が必要なので別途指定します。 |

Arch の一覧を入れる場合:

```sh
bun run src/install/packages.ts arch-official arch-aur
```

## 共通フラグ

更新・インストール系スクリプトは `src/lib/runner.ts` の `parseArgs` で次のフラグを解釈します。

- `--dry-run`: 何も実行せず、積まれるコマンドを表示します。
- `--no-pueue`: pueue に積まず、その場で実行します。
- `--serial`: タスクを前のタスクの後に順番に積みます。
- `--after <id>`: 指定した pueue タスクの後に積みます。

stdout には積まれるコマンドだけを出し、進捗・警告・スキップは stderr に出します。この約束により、変更前後の dry run を差分比較できます。`vup.sh --dry-run` の出力は次のように正規化して比較します。

```sh
sed -E 's/^pueue add (--after [^-]*)?-- //' | sort
```

## スクリプト一覧

| パス | 説明 |
| --- | --- |
| `src/update/all.ts` | 利用可能なツールと OS パッケージをまとめて更新します。 |
| `src/generate/package-lists.ts` | 各パッケージマネージャーの一覧を生成します。 |
| `src/install/packages.ts` | パッケージ一覧から各パッケージをインストールします。 |
| `src/update/cargo-packages.ts` | Cargo の更新対象を調べて更新します。 |
| `src/update/fish-completions.ts` | Fish 補完を更新します。 |
| `src/update/mise-refs.ts` | mise で管理する `ref:` ピンを更新します。 |
| `src/update/docker-compose.ts` | Docker Compose プラグインを更新します。 |
| `src/misc/editorconfig.ts` | `.editorconfig-template` から `.editorconfig` を生成します。 |
| `src/misc/pip-roots.py` | Python 環境の metadata から依存関係の根を調べます。 |

共有ライブラリは `src/lib/` にあります。

- `platform`: OS ごとのパスとアーキテクチャ
- `cmd`: コマンドと環境変数の確認
- `shell`: シェル文字列のクォート
- `pueue`: pueue のタスク追加
- `runner`: 実行モード、依存、dry run の処理
- `cargo`: Cargo の一覧パース
- `uv`: uv tool の一覧・インストール形式
- `fish`: Fish 補完の共通処理

## パッケージ一覧ファイル

一覧はリポジトリ内ではなく、`~/.mimikun-pkglists/` に保存します。OS ごとの一覧には `linux_` / `windows_` / `darwin_` の接頭辞が付き、OS 共通の一覧は `gh_extension_list.txt` だけです。

| 一覧 | 生成 | 導入 |
| --- | --- | --- |
| `arch_official_packages.txt` | `arch-official` | `arch-official` |
| `arch_aur_packages.txt` | `arch-aur` | `arch-aur` |
| `cargo_packages.txt` | `cargo` | `cargo` |
| `pip_packages.txt` | `pip` | `pip` |
| `pnpm_packages.txt` | `pnpm` | `pnpm` |
| `uv_tools.txt` | `uv` | `uv` |
| `rubygem_list.txt` | `rubygem` | — |
| `gh_extension_list.txt`（共有） | `gh-extension` | `gh-extension` |

## 開発

```sh
bun install
task check       # biome check --write → tsc --noEmit
task lint
task fix
task typecheck
```

コミット前には `task check` を通してください。新しいスクリプトには必ず `--dry-run` を持たせます。

## 関連文書

- [`AGENTS.md`](AGENTS.md): 設計方針、移管の経緯、検証手順
- [`docs/agents/`](docs/agents/): issue tracker、triage labels、domain の指示

