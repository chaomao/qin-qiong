const vscode = require('vscode');
const path = require('path');
const cp = require('child_process');
const lodash = require('lodash');
const marked = require('marked');
const getWebviewContent = require('./issueDetails');
const { createStatusBar, setScanState, setScanResults } = require('./statusBar');
const fs = require('fs');
const { initializeDatabase, saveJsonToSqlite } = require('./db');
const getAIResponse = require('./ai');

// setup global variable
let db = null;
let statusBarItem = null;
const diagnosticCollection = vscode.languages.createDiagnosticCollection('codeIssues');

function activate(context) {
	console.log('*******秦琼在此，诸鬼退散!********');

	// Create a status bar item
	statusBarItem = createStatusBar();

	// Register the status bar item in the context
	context.subscriptions.push(statusBarItem);
	db = initializeDatabase(context);

	// Setup regular checking availability
	const intervalId = setInterval(() => {
		saveCurrentTimestampToAvailabilityCheck();
	}, 5000);

	context.subscriptions.push({ dispose: () => clearInterval(intervalId) });

	const handleJavaFileEditThrottled = lodash.debounce((document) => {
		handleJavaFileEdit(context, document);
	}, 3000);

	// Event listener for when a Java file is edited
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
		if (event.document.languageId === 'java') {
			handleJavaFileEditThrottled(event.document);
		}
	}));

	const problemDetailPanel = vscode.commands.registerCommand('qinqiong.showProblemDetail', (diagnostic) => {
		const panel = vscode.window.createWebviewPanel(
			'problemDetails',
			'Problem Details',
			vscode.ViewColumn.Two,
			{ enableScripts: true }
		);

		panel.webview.html = getWebviewContent(diagnostic);
		panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'sendMessage':
						const userMessage = message.text;
						try {
							const aiResponse = await getAIResponse(userMessage);
							panel.webview.postMessage({ command: 'aiResponse', text: aiResponse });
						} catch (error) {
							vscode.window.showErrorMessage(`Error communicating with AI: ${error.message}`);
						}
						return;
				}
			},
			undefined,
			context.subscriptions
		);
	});

	context.subscriptions.push(problemDetailPanel);

	// Register a Code Action Provider to provide the context menu item
	vscode.languages.registerCodeActionsProvider('*', {
		provideCodeActions(document, range, context, token) {
			const codeActions = context.diagnostics.map(diagnostic => {
				if (diagnostic.source === 'codeIssues') {
					const action = new vscode.CodeAction('Show Problem Detail', vscode.CodeActionKind.QuickFix);
					action.command = {
						command: 'qinqiong.showProblemDetail',
						title: 'Show Problem Detail',
						arguments: [diagnostic]
					};
					return action;
				}
			});
			return codeActions;
		}
	});
}

function saveCurrentTimestampToAvailabilityCheck() {
	db.prepare('INSERT INTO availability_check (check_at) VALUES (?)')
		.run(new Date().toISOString());
}

function handleJavaFileEdit(context, document) {
	console.log('Scan Java file', document.uri.fsPath);
	setScanState(statusBarItem);
	const outputPath = path.join(context.extensionPath, `scan_results${Date.now()}.json`);

	// Run the bearer scan command
	const command = `bearer scan  --exit-code 0 -f json --hide-progress-bar --quiet --scanner secrets,sast --output ${outputPath} ${document.uri.fsPath}`;

	cp.exec(command, (err, stdout, stderr) => {
		if (err) {
			console.error('Error running bearer scan:', err);
			return;
		}
		console.log('Bearer scan success, path:', outputPath);
		if (stderr) {
			console.error('Bearer scan errors:', stderr);
		}
		updateDiagnostics(outputPath);
		saveJsonToSqlite(db, outputPath);
	});
}

const SEVERITY_MAP = {
	critical: vscode.DiagnosticSeverity.Error,
	high: vscode.DiagnosticSeverity.Error,
	medium: vscode.DiagnosticSeverity.Warning,
	low: vscode.DiagnosticSeverity.Information,
	warning: vscode.DiagnosticSeverity.Hint
};

function updateDiagnostics(scanResult) {
	diagnosticCollection.clear();
	let full_filename;

	fs.readFile(scanResult, 'utf8', (err, data) => {
		if (err) {
			console.error('Error reading JSON file:', err);
			return;
		}
		const issuesData = JSON.parse(data);
		const diagnostics = [];
		for (const severity in issuesData) {
			issuesData[severity].forEach((issue) => {
				full_filename = issue.full_filename;
				const range = new vscode.Range(
					new vscode.Position(issue.source.start - 1, issue.source.column.start - 1),
					new vscode.Position(issue.source.end - 1, issue.source.column.end - 1)
				);
				const message = issue.title;
				const severityLevel = SEVERITY_MAP[severity]; // Use appropriate severity level

				const diagnostic = new vscode.Diagnostic(range, message, severityLevel);

				diagnostic.source = 'codeIssues';

				// Add any additional properties to the diagnostic
				diagnostic.code = {
					value: issue.id,
					severity: severity,
					target: vscode.Uri.parse(issue.documentation_url),
					description: marked.parse(issue.description),
					code_extract: issue.code_extract
				};

				diagnostics.push(diagnostic);
			});
		}

		setScanResults(statusBarItem, diagnostics);
		const fileUri = vscode.Uri.file(full_filename);
		diagnosticCollection.set(fileUri, diagnostics);
	});
}

// This method is called when your extension is deactivated
function deactivate() {
	if (db) db.close();
	if (statusBarItem) statusBarItem = null;
}

module.exports = {
	activate,
	deactivate
};
