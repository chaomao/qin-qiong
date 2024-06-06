const vscode = require('vscode');

function createStatusBar() {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '秦琼: 安全';
  statusBarItem.backgroundColor = undefined;
  statusBarItem.show();
  return statusBarItem;
}

function setScanState(statusBarItem) {
  statusBarItem.text = "秦琼: 扫描中";
  statusBarItem.backgroundColor = undefined;
}

function setScanResults(statusBarItem, diagnostics) {
  if (diagnostics.length > 0) {
    statusBarItem.text = `秦琼: ${diagnostics.length} 问题`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else {
    statusBarItem.text = `秦琼: 安全`;
  }
}


module.exports = {
  createStatusBar,
  setScanState,
  setScanResults
};