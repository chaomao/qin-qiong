const vscode = require('vscode');
const path = require('path');
const cp = require('child_process');
const lodash = require('lodash');
const sqlite3 = require('sqlite3').verbose();
const marked = require('marked');
const getWebviewContent = require('./issueDetails');
const axios = require('axios');
const fs = require('fs');

let db = null;
let statusBarItem = null;
function activate(context) {
	console.log('*******秦琼在此，诸鬼退散!********');

	// Create a status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.text = '秦琼: 安全';
	statusBarItem.backgroundColor = undefined;
	statusBarItem.show();

	// Register the status bar item in the context
	context.subscriptions.push(statusBarItem);
	initializeDatabase(context);

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

	let disposable = vscode.commands.registerCommand('qinqiong.showProblemDetail', (diagnostic) => {
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

	context.subscriptions.push(disposable);

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



const messagesPool = [
	{ role: 'system', content: 'you are a software engineer expert focus on analyze and fix coding issues' }
];

async function getAIResponse(userMessage) {
	const apiKey = 'openai-api-key';
	// const chat-glm-apiKey = 'chatglm-key';
	const userInput = { role: 'user', content: userMessage };
	const response = await axios.post(
		'https://api.openai.com/v1/chat/completions',
		// 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
		{
			model: 'gpt-3.5-turbo', // Use the appropriate model
			// model: 'glm-3-turbo', // Use the appropriate model
			messages: [...messagesPool, userInput],
		},
		{
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
		}
	);
	const assistantResponse = response.data.choices[0].message;
	messagesPool.push(userInput, assistantResponse);
	return marked.parse(assistantResponse.content);
}


function saveCurrentTimestampToAvailabilityCheck() {
	db.prepare('INSERT INTO availability_check (check_at) VALUES (?)')
		.run(new Date().toISOString());
}

function initializeDatabase(context) {
	console.log('initializeDatabase');
	const extensionPath = context.extensionPath;
	const dbPath = path.join(extensionPath, 'scan_results.db');
	db = new sqlite3.Database(dbPath);

	db.exec(`CREATE TABLE IF NOT EXISTS scan_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_at TIMESTAMP,
        total_issue_count INTEGER
    )`);

	db.exec(`CREATE TABLE IF NOT EXISTS scan_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_summary_id INTEGER,
        title TEXT,
        severity TEXT,
        description TEXT,
        code_source TEXT,
        code_extract TEXT,
        full_filename TEXT,
        FOREIGN KEY (scan_summary_id) REFERENCES scan_summary(id)
    )`);

	db.exec(`CREATE TABLE IF NOT EXISTS availability_check (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_at TIMESTAMP
    )`);
}

function handleJavaFileEdit(context, document) {
	console.log('Scan Java file', document.uri.fsPath);
	statusBarItem.text = "秦琼: 扫描中";
	statusBarItem.backgroundColor = undefined;
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
		saveJsonToSqlite(outputPath);
	});
}

const SEVERITY_MAP = {
	critical: vscode.DiagnosticSeverity.Error,
	high: vscode.DiagnosticSeverity.Error,
	medium: vscode.DiagnosticSeverity.Warning,
	low: vscode.DiagnosticSeverity.Information,
	warning: vscode.DiagnosticSeverity.Hint
};

const diagnosticCollection = vscode.languages.createDiagnosticCollection('codeIssues');

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

		if (diagnostics.length > 0) {
			statusBarItem.text = `秦琼: ${diagnostics.length} 问题`;
			statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		} else {
			statusBarItem.text = `秦琼: 安全`;
		}
		const fileUri = vscode.Uri.file(full_filename);
		diagnosticCollection.set(fileUri, diagnostics);
	});
}

function saveJsonToSqlite(jsonPath) {
	// Read the JSON file
	fs.readFile(jsonPath, 'utf8', (err, data) => {
		if (err) {
			console.error('Error reading JSON file:', err);
			return;
		}
		const jsonData = JSON.parse(data);

		const formattedJsonData = [];

		for (const severity in jsonData) {
			jsonData[severity].forEach(element => {
				formattedJsonData.push({ ...element, severity });
			});
		}

		const insertSummary = db.prepare('INSERT INTO scan_summary (scan_at, total_issue_count) VALUES (?, ?)');
		insertSummary.run(new Date().toISOString(), formattedJsonData.length, function () {
			const scanSummaryId = this.lastID;
			const insertDetail = db.prepare('INSERT INTO scan_details (scan_summary_id, title, severity, description, code_source, code_extract, full_filename) VALUES (?, ?, ?, ?, ?, ?, ?)');
			for (const detail of formattedJsonData) {
				insertDetail.run(
					scanSummaryId,
					detail.title,
					detail.severity,
					detail.description,
					JSON.stringify(detail.source),
					detail.code_extract,
					detail.full_filename
				);
			}
		});
	});
};


// This method is called when your extension is deactivated
function deactivate() {
	if (db) db.close();
	if (statusBarItem) statusBarItem = null;
}

module.exports = {
	activate,
	deactivate
};
