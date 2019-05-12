const { spawn } = require('child_process');
const { mochaWorker, createConnection, writeMessage, readMessages } = require('vscode-test-adapter-remoting-util');

// TODO:
// support env?
// support workerArgs.logEnabled
// error reporting (e.g. launcherScript doesn't exist, docker not running,...)
// relay console messages from our child to our parent process
// reload when docker-launcher.js changes
// error recovery: call docker rm -f when we receive a signal

const localWorkspace = __dirname;
const remoteHome = '/home/node';
const remoteWorker = remoteHome + '/worker.js';
const remoteWorkspace = remoteHome + '/workspace';
const port = 8123;

function remoteToLocal(path) {
	if (path.startsWith(remoteWorkspace)) {
		return localWorkspace + path.substring(remoteWorkspace.length)
	} else {
		return path;
	}
}

function localToRemote(path) {
	if (path.startsWith(localWorkspace)) {
		return remoteWorkspace + path.substring(localWorkspace.length)
	} else {
		return path;
	}
}

process.once('message', workerArgsJson => {

	const origWorkerArgs = JSON.parse(workerArgsJson);
	const localWorker = origWorkerArgs.workerScript;

	const workerArgs = mochaWorker.convertWorkerArgs(origWorkerArgs, localToRemote);
	workerArgs.mochaPath = localToRemote(require.resolve('mocha'));

	let nodeDebugArgs = [];
	let dockerDebugArgs = [];
	let rejectClosedSocket = undefined;
	if (workerArgs.debuggerPort) {
		nodeDebugArgs = [ `--inspect-brk=0.0.0.0:${workerArgs.debuggerPort}` ]
		dockerDebugArgs = [ '-p', `${workerArgs.debuggerPort}:${workerArgs.debuggerPort}` ];
		rejectClosedSocket = 1500;
	}

	const childProcess = spawn(
		'docker',
		[
			'run', '--rm', '-i',
			'-v', `${localWorker}:${remoteWorker}`,
			'-v', `${localWorkspace}:${remoteWorkspace}`,
			'-w', localToRemote(process.cwd()),
			'-p', `${port}:${port}`,
			...dockerDebugArgs,
			'node:current-alpine',
			'node',
			...nodeDebugArgs,
			remoteWorker, `{"role":"server","port":${port}}`
		]
	);

	childProcess.on('error', err => console.log(err));
	childProcess.on('exit', () => console.log('Exited'));

	createConnection(port, { rejectClosedSocket }).then(socket => {

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
