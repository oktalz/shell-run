# Shell Run

Source available at [github.com/oktalz/shell-run](https://github.com/oktalz/shell-run).

Run shell scripts directly from VS Code — right-click in the explorer, right-click in the editor, or click the CodeLens links above the first line.

## Supported file types

| Extension | Runner |
| --------- | ------ |
| `.sh` | `sh` / `bash` / shebang (see [Interpreter](#interpreter)) |
| `.bat`, `.cmd` | `cmd /c` |
| `.ps1` | `powershell -ExecutionPolicy Bypass -File` |

Scripts always run with their **containing folder** as the working directory.

## Running a script

### CodeLens (inside the editor)

When a supported script file is open, two clickable links appear above line 1:

```text
▶ Run  ▶ Run with Args
```

### Context menu

Right-click a supported file in the **Explorer** or inside the **Editor**:

- **Run: Execute** — run with no arguments
- **Run: Execute with Args** — open an input box, then run with the provided arguments

## Output

Where output appears is controlled by the `shell-run.outputType` setting (default: `notification`):

| Value | Behaviour |
| ----- | --------- |
| `tab` | Reuse a single `shell-run` tab (updated on each run) |
| `newTab` | Open a new plain-text tab for each run |
| `outputChannel` | Append to the **Shell Run** Output panel |
| `notification` | Show a VS Code notification (truncated at 500 characters) |
| `terminal` | Run in the integrated terminal (process stays alive) |

### Per-script output override

Add a directive anywhere in the **first 3 lines** of the script to override the setting for that file:

```sh
# shell-run:output:notification
```

```bat
rem shell-run:output:outputChannel
```

```powershell
# shell-run:output:newTab
```

The directive line is automatically stripped from the displayed output.

## Settings

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `shell-run.outputType` | `notification` | Where to display script output |
| `shell-run.interpreter` | `auto` | Shell to use for `.sh` files |
| `shell-run.showScriptInfo` | `false` | Prepend the command and working directory to the output |

### Interpreter

Applies to `.sh` files only.

| Value | Behaviour |
| ----- | --------- |
| `auto` | Read the shebang (`#!`) from line 1; fall back to `sh` if absent |
| `sh` | Always use `sh` |
| `bash` | Always use `bash` |

Examples detected by `auto`:

```sh
#!/bin/bash          →  bash
#!/usr/bin/env zsh   →  zsh
#!/bin/sh            →  sh
```
