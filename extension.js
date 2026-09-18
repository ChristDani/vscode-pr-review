// @ts-nocheck
const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

function findBash() {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
  ];
  return candidates.find(p => fs.existsSync(p)) || 'bash'; // fallback: bash del PATH
}

const BASH_PATH = findBash();

function run(cmd, cwd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, shell: BASH_PATH }, (err, stdout, stderr) => {
      if (err) reject(stderr || err.message);
      else resolve(stdout);
    });
  });
}

/**
 * @param {vscode.ExtensionContext} context
 */

function activate(context) {
	const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	// Botón: iniciar revisión
	const reviewBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	reviewBtn.text = '$(git-branch) Start review';
	reviewBtn.command = 'vscode-pr-review-buttons.start';
	reviewBtn.tooltip = 'Crear rama temporal de revisión';
	reviewBtn.show();
	context.subscriptions.push(reviewBtn);

	// Botón: finalizar revisión
	const cleanupBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
	cleanupBtn.text = '$(trash) Finish review';
	cleanupBtn.command = 'vscode-pr-review-buttons.cleanup';
	cleanupBtn.tooltip = 'Descartar merge y eliminar rama temporal';
	cleanupBtn.show();
	context.subscriptions.push(cleanupBtn);

	context.subscriptions.push(
    vscode.commands.registerCommand('vscode-pr-review-buttons.start', async () => {
      const branch = await vscode.window.showInputBox({
        prompt: 'Nombre de la rama a revisar',
        placeHolder: 'feature/nueva-funcionalidad'
      });
      if (!branch) return;

      const savedBase = context.workspaceState.get('branchReview.lastBase', 'dev');
      const baseBranch = await vscode.window.showInputBox({
        prompt: '¿Contra qué rama se va a hacer la PR? (rama base)',
        value: savedBase,
        valueSelection: [0, savedBase.length]
      });
      if (!baseBranch) return;

      try {
        vscode.window.setStatusBarMessage('$(sync~spin) Preparando revisión...', 3000);
        await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Revisando ${branch}`,
          cancellable: false
        },
        async (progress) => {
          progress.report({ increment: 0, message: `Cambiando a ${baseBranch}...` });
          await run(`git switch ${baseBranch}`, cwd);

          progress.report({ increment: 20, message: `Actualizando ${baseBranch}...` });
          await run(`git pull --ff-only origin ${baseBranch}`, cwd);

          progress.report({ increment: 20, message: `Descargando ${branch}...` });
          await run(`git fetch origin ${branch}`, cwd);

          progress.report({ increment: 20, message: `Creando review/${branch}...` });
          await run(`git switch -c review/${branch}`, cwd);

          progress.report({ increment: 20, message: `Fusionando cambios...` });
          await run(`git merge --no-commit --no-ff origin/${branch}`, cwd);

          progress.report({ increment: 20, message: `Listo` });
        }
      );

        await context.workspaceState.update('branchReview.lastBase', baseBranch);
        vscode.window.showInformationMessage(`✅ Rama review/${branch} lista para revisar (base: ${baseBranch}).`);
      } catch (e) {
        vscode.window.showErrorMessage(`Error: ${e}`);
      }
    })
  );

	context.subscriptions.push(
    vscode.commands.registerCommand('vscode-pr-review-buttons.cleanup', async () => {
      try {
        const current = (await run(`git branch --show-current`, cwd)).trim();
        if (!current.startsWith('review/')) {
          vscode.window.showWarningMessage('No estás en una rama review/*.');
          return;
        }

        const baseBranch = context.workspaceState.get('branchReview.lastBase');
        if (!baseBranch) {
          vscode.window.showWarningMessage(
            'No hay una rama base registrada para este proyecto. Ejecuta primero "Start review".'
          );
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Limpiando revisión',
            cancellable: false
          },
          async (progress) => {
            progress.report({ increment: 0, message: 'Descartando merge...' });
            await run(`git merge --abort || true`, cwd);

            progress.report({ increment: 40, message: `Volviendo a ${baseBranch}...` });
            await run(`git switch ${baseBranch}`, cwd);

            progress.report({ increment: 40, message: `Eliminando ${current}...` });
            await run(`git branch -D ${current}`, cwd);

            progress.report({ increment: 20, message: 'Listo' });
          }
        );

        vscode.window.showInformationMessage(`🧹 ${current} eliminada, de vuelta en ${baseBranch}.`);
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
