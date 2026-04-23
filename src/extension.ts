import * as vscode from 'vscode';
import { exec, ExecException } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

class ShellRunContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;
    private _content: string = '';

    update(uri: vscode.Uri, content: string) {
        this._content = content;
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(_uri: vscode.Uri): string {
        return this._content;
    }
}

const shellRunProvider = new ShellRunContentProvider();
let outputChannel: vscode.OutputChannel | undefined;

async function displayOutput(content: string, outputType: string | undefined) {
    if (outputType === 'newTab') {
        const document = await vscode.workspace.openTextDocument({ content, language: 'plaintext' });
        await vscode.window.showTextDocument(document);
    } else if (outputType === 'outputChannel') {
        if (!outputChannel) {
            outputChannel = vscode.window.createOutputChannel('Shell Run');
        }
        outputChannel.show();
        outputChannel.appendLine(content);
    } else if (outputType === 'notification') {
        const MAX = 500;
        const text = content.length > MAX ? content.slice(0, MAX) + '…' : content;
        vscode.window.showInformationMessage(text);
    } else {
        // default: tab
        const uri = vscode.Uri.parse('shell-run:shell-run');
        shellRunProvider.update(uri, content);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
    }
}

function resolveShInterpreter(filePath: string): string {
    const setting = vscode.workspace.getConfiguration('shell-run').get<string>('interpreter', 'auto');
    if (setting !== 'auto') {
        return setting;
    }
    try {
        const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
        if (firstLine.startsWith('#!')) {
            const shebang = firstLine.slice(2).trim();
            // #!/usr/bin/env bash  →  bash
            // #!/bin/bash          →  bash
            const parts = shebang.split(/\s+/);
            const bin = parts[0].endsWith('env') && parts[1] ? parts[1] : path.basename(parts[0]);
            if (bin) {
                return bin;
            }
        }
    } catch {
        // unreadable — fall through
    }
    return 'sh';
}

const OUTPUT_TYPES = ['tab', 'newTab', 'outputChannel', 'notification', 'terminal'];

function resolveOutputType(filePath: string): string {
    try {
        const lines = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 3);
        for (const line of lines) {
            const match = line.match(/shell-run:output:(\S+)/);
            if (match && OUTPUT_TYPES.includes(match[1])) {
                return match[1];
            }
        }
    } catch {
        // unreadable — fall through
    }
    return vscode.workspace.getConfiguration('shell-run').get<string>('outputType', 'notification');
}

function quote(s: string): string {
    return /^[\w.\-]+$/.test(s) ? s : `"${s}"`;
}

function buildCommand(filePath: string, args?: string, useBasename = false): string {
    const target = useBasename ? path.basename(filePath) : filePath;
    const ext = path.extname(filePath).toLowerCase();
    const argsStr = args ? ` ${args}` : '';
    if (ext === '.bat' || ext === '.cmd') {
        return `cmd /c ${quote(target)}${argsStr}`;
    }
    if (ext === '.ps1') {
        return `powershell -ExecutionPolicy Bypass -File ${quote(target)}${argsStr}`;
    }
    return `${resolveShInterpreter(filePath)} ${quote(target)}${argsStr}`;
}

function runScript(uri: vscode.Uri | undefined, args?: string) {
    const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!filePath) {
        vscode.window.showErrorMessage('Shell Run: no file selected.');
        return;
    }

    const dir = path.dirname(filePath);
    const command = buildCommand(filePath, args);

    const outputType = resolveOutputType(filePath);

    if (outputType === 'terminal') {
        const terminal = vscode.window.createTerminal({ name: path.basename(filePath), cwd: dir });
        terminal.show();
        terminal.sendText(buildCommand(filePath, args, true));
        return;
    }

    const showInfo = vscode.workspace.getConfiguration('shell-run').get<boolean>('showScriptInfo', false);

    exec(command, { cwd: dir }, async (error: ExecException | null, stdout: string, stderr: string) => {
        const cleanStdout = stdout.split('\n').filter((l: string) => !l.includes('shell-run:output:')).join('\n');
        const body = [stderr ? `[stderr]\n${stderr}` : '', cleanStdout].filter(Boolean).join('\n')
            || (error ? `Error: ${error.message}` : '(no output)');
        const header = `# ${command}\n# cwd: ${dir}\n\n`;
        const content = (showInfo && outputType !== 'notification') ? header + body : body;

        await displayOutput(content, outputType);

        if (error && outputType !== 'outputChannel') {
            vscode.window.showErrorMessage(`Shell Run failed (exit ${error.code})`);
        }
    });
}

const SUPPORTED_LANGUAGES = ['shellscript', 'bat', 'powershell'];

class ShellRunCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const topLine = new vscode.Range(0, 0, 0, 0);
        return [
            new vscode.CodeLens(topLine, {
                title: '▶ Run',
                command: 'shell-run.execute',
                arguments: [document.uri]
            }),
            new vscode.CodeLens(topLine, {
                title: '▶ Run with Args',
                command: 'shell-run.executeWithArgs',
                arguments: [document.uri]
            }),
        ];
    }
}

export function activate(context: vscode.ExtensionContext) {
    const codeLensProvider = new ShellRunCodeLensProvider();
    const disposables = [
        vscode.workspace.registerTextDocumentContentProvider('shell-run', shellRunProvider),
        ...SUPPORTED_LANGUAGES.map(lang =>
            vscode.languages.registerCodeLensProvider({ language: lang }, codeLensProvider)
        ),

        vscode.commands.registerCommand('shell-run.execute', (uri: vscode.Uri) => {
            runScript(uri);
        }),

        vscode.commands.registerCommand('shell-run.executeWithArgs', async (uri: vscode.Uri) => {
            const args = await vscode.window.showInputBox({
                prompt: 'Arguments to pass to the script',
                placeHolder: 'e.g. --env prod --dry-run'
            });
            if (args === undefined) {
                return; // user cancelled
            }
            runScript(uri, args);
        }),
    ];

    context.subscriptions.push(...disposables);
}

export function deactivate() {}
