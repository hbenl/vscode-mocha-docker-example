const { spawn } = require('child_process');
const { readFileSync } = require('fs');
const { mochaWorker, createConnection, writeMessage, readMessages } = require('vscode-test-adapter-remoting-util');

// TODO:
// support env
// debugging
// error reporting (e.g. launcherScript doesn't exist, docker not running,...)
// relay console messages from our child to our parent process
// reload when docker-launcher.js changes

const localPath = __dirname;
const remotePath = '/home/node/workspace';
const port = 8123;

function remoteToLocal(path) {
	if (path.startsWith(remotePath)) {
		return localPath + path.substring(remotePath.length)
	} else {
		return path;
	}
}

function localToRemote(path) {
	if (path.startsWith(localPath)) {
		return remotePath + path.substring(localPath.length)
	} else {
		return path;
	}
}

process.once('message', workerArgsJson => {

	const workerArgs = mochaWorker.convertWorkerArgs(JSON.parse(workerArgsJson), localToRemote);
	workerArgs.mochaPath = localToRemote(require.resolve('mocha'));

	const childProcess = spawn(
		'docker',
		[
			'run', '--rm', '-i',
			'-v', `${localPath}:${remotePath}`,
			'-w', localToRemote(process.cwd()),
			'-p', `${port}:${port}`,
			'node:current-alpine',
			'node', '-', `{"role":"server","port":${port}}`
		]
	);

	childProcess.on('error', err => console.log(err));
	childProcess.on('exit', () => console.log('Exited'));

	childProcess.stdin.write(readFileSync(workerArgs.workerScript), () => console.log('Sent worker'));
	childProcess.stdin.end();

	createConnection(port).then(socket => {

		console.log('Connected');

		writeMessage(socket, workerArgs);
		console.log('Sent workerArgs');

		readMessages(socket, msg => {
			if (workerArgs.action === 'loadTests') {
				process.send(mochaWorker.convertTestLoadMessage(msg, remoteToLocal));
			} else {
				process.send(mochaWorker.convertTestRunMessage(msg, remoteToLocal));
			}
		});
	});
});
