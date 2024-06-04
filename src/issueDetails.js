function getWebviewContent(diagnostic) {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Problem Details</title>
    <style>
      body { font-family: Arial, sans-serif; }
      .container { padding: 20px; }
      .issue-title { font-size: 24px; font-weight: bold; }
      .code-block { background-color: #f5f5f5; padding: 10px; border-radius: 5px; }
      .chat-window { border: 1px solid #ccc; padding: 10px; height: 200px; overflow-y: scroll; }
      .chat-message { margin-bottom: 10px; }
      .critical {color: red;}
      .high {color: red;}
      .medium {color: yellow;}
      .low {color: blue;}
      .warning{color:blue;}
      .input-box {height: 35px;}
			html {
	box-sizing: border-box;
	font-size: 13px;
}

*,
*:before,
*:after {
	box-sizing: inherit;
}

a {
	color: var(--vscode-textLink-foreground);
}

a:hover,
a:active {
	color: var(--vscode-textLink-activeForeground);
}

code {
	font-size: var(--vscode-editor-font-size);
	font-family: var(--vscode-editor-font-family);
}

button {
	border: none;
	padding: var(--input-padding-vertical) var(--input-padding-horizontal);
	width: 100%;
	text-align: center;
	outline: 1px solid transparent;
	outline-offset: 2px !important;
	color: var(--vscode-button-foreground);
	background: var(--vscode-button-background);
}

button:hover {
	cursor: pointer;
	background: var(--vscode-button-hoverBackground);
}

button:focus {
	outline-color: var(--vscode-focusBorder);
}

button.secondary {
	color: var(--vscode-button-secondaryForeground);
	background: var(--vscode-button-secondaryBackground);
}

button.secondary:hover {
	background: var(--vscode-button-secondaryHoverBackground);
}

input:not([type='checkbox']),
textarea {
	display: block;
	width: 100%;
	border: none;
	font-family: var(--vscode-font-family);
	padding: var(--input-padding-vertical) var(--input-padding-horizontal);
	color: var(--vscode-input-foreground);
	outline-color: var(--vscode-input-border);
	background-color: var(--vscode-input-background);
}

input::placeholder,
textarea::placeholder {
	color: var(--vscode-input-placeholderForeground);
}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="issue-title">${diagnostic.message}</div>
			<h2>Code:</h2>
      <pre class="code-block"><code>${diagnostic.code.code_extract}</code></pre>
      <div class="issue-description">
        <h2 style="text-transform: uppercase" class="${diagnostic.code.severity}">Severity: ${diagnostic.code.severity}</h2>
        <div>${diagnostic.code.description}</div>
      </div>
      <div class="chat-window" id="chatWindow">
        <!-- Chat messages will appear here -->
      </div>
			<div style="display:flex">
      <input type="text" class="input-box" id="chatInput" placeholder="Type a message..." style="flex:4">
      <button style="flex:1"onclick="sendMessage()">Send</button>
			</div>
    </div>
    <script>
      const vscode = acquireVsCodeApi();
      function sendMessage() {
        const inputBox = document.getElementById('chatInput');
        const message = inputBox.value;
        if (message) {
          vscode.postMessage({ command: 'sendMessage', text: message });
          inputBox.value = '';
          const chatWindow = document.getElementById('chatWindow');
          chatWindow.innerHTML += '<div class="chat-message">' + message + '</div>';
          chatWindow.scrollTop = chatWindow.scrollHeight;
        }
      }
    </script>
  </body>
  </html>`;
};

module.exports = { getWebviewContent };