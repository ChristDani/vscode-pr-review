// @ts-nocheck
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

function run(cmd, cwd) {
  return new Promise((resolve, reject) => {
	exec(cmd, { cwd, shell: '/bin/bash' }, (err, stdout, stderr) => {
	  if (err) reject(stderr || err.message);
	  else resolve(stdout);
	});
  });
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */

function activate(context) {

	const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	// Botón: iniciar revisión
	const reviewBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	reviewBtn.text = '$(git-branch) Review rama';
	reviewBtn.command = 'branch-review-buttons.start';
	reviewBtn.tooltip = 'Crear rama temporal de revisión';
	reviewBtn.show();
	context.subscriptions.push(reviewBtn);

	// Botón: limpiar revisión
	const cleanupBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
	cleanupBtn.text = '$(trash) Cleanup review';
	cleanupBtn.command = 'branch-review-buttons.cleanup';
	cleanupBtn.tooltip = 'Descartar merge y eliminar rama temporal';
	cleanupBtn.show();
  	context.subscriptions.push(cleanupBtn);

	context.subscriptions.push(
		vscode.commands.registerCommand('branch-review-buttons.start', async () => {
			const branch = await vscode.window.showInputBox({
				prompt: 'Nombre de la rama a revisar',
				placeHolder: 'feature/nueva-funcionalidad'
			});
			if (!branch) return;

			try {
				vscode.window.setStatusBarMessage('$(sync~spin) Preparando revisión...', 3000);
				await run(`git switch dev`, cwd);
				await run(`git pull --ff-only origin dev`, cwd);
				await run(`git fetch origin ${branch}`, cwd);
				await run(`git switch -c review/${branch}`, cwd);
				await run(`git merge --no-commit --no-ff origin/${branch}`, cwd);
				vscode.window.showInformationMessage(`✅ Rama review/${branch} lista para revisar.`);
			} catch (e) {
				vscode.window.showErrorMessage(`Error: ${e}`);
			}
    	})
  	);

	context.subscriptions.push(
		vscode.commands.registerCommand('branch-review-buttons.cleanup', async () => {
			try {
				const current = (await run(`git branch --show-current`, cwd)).trim();
				if (!current.startsWith('review/')) {
				vscode.window.showWarningMessage('No estás en una rama review/*.');
				return;
				}
				await run(`git merge --abort || true`, cwd);
				await run(`git switch dev`, cwd);
				await run(`git branch -D ${current}`, cwd);
				vscode.window.showInformationMessage(`🧹 ${current} eliminada.`);
			} catch (e) {
				vscode.window.showErrorMessage(`Error: ${e}`);
			}
		})
	);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
	activate,
	deactivate
}
