const { spawn } = require('child_process');
const { inspect } = require('util');
const { mochaWorker, createConnection, writeMessage, readMessages } = require('vscode-test-adapter-remoting-util');

// TODO:
// always handle the exit option in the worker process
// error recovery: call docker rm -f when we receive a signal

const localWorkspace = __dirname;
const remoteHome = '/home/node';
const remoteWorker = remoteHome + '/worker.js';
const remoteWorkspace = remoteHome + '/workspace';
const port = 8123;

function convertPaths(srcPath, dstPath) {
	return function(path) {
		if (path.startsWith(srcPath)) {
			return dstPath + path.substring(srcPath.length)
		} else {
			return path;
		}
	}
}
const localToRemote = convertPaths(localWorkspace, remoteWorkspace);
const remoteToLocal = convertPaths(remoteWorkspace, localWorkspace);

process.once('message', workerArgsJson => {

	const origWorkerArgs = JSON.parse(workerArgsJson);
	const localWorker = origWorkerArgs.workerScript;

	process.send('Received workerArgs');

	const workerArgs = mochaWorker.convertWorkerArgs(origWorkerArgs, localToRemote);
	workerArgs.mochaPath = localToRemote(origWorkerArgs.mochaPath);

	let nodeDebugArgs = [];
	let dockerDebugArgs = [];
	let rejectClosedSocket = undefined;
	if (workerArgs.debuggerPort) {
		nodeDebugArgs = [ `--inspect-brk=0.0.0.0:${workerArgs.debuggerPort}` ]
		dockerDebugArgs = [ '-p', `${workerArgs.debuggerPort}:${workerArgs.debuggerPort}` ];
		rejectClosedSocket = 1500;
	}

	process.send('Starting worker process');

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
		],
		{ stdio: 'inherit' }
	);

	childProcess.on('error', err => process.send(`Error from worker process: ${inspect(err)}`));
	childProcess.on('exit', (code, signal) => {
		process.send(`Worker process exited with code ${code} and signal ${signal}`);
		if ((workerArgs.action === 'loadTests') && (code || signal)) {
			process.send({ type: 'finished', errorMessage: `The worker process finished with code ${code} and signal ${signal}.\nThe diagnostic log may contain more information, enable it with the "mochaExplorer.logpanel" or "mochaExplorer.logfile" settings.` });
		}
	});

	process.send('Connecting to worker process');

	createConnection(port, { rejectClosedSocket }).then(socket => {

		process.send('Connected');

		writeMessage(socket, workerArgs);

		process.send('Sent workerArgs to worker process');

		readMessages(socket, msg => {
			if (workerArgs.action === 'loadTests') {
				process.send(mochaWorker.convertTestLoadMessage(msg, remoteToLocal));
			} else {
				process.send(mochaWorker.convertTestRunMessage(msg, remoteToLocal));
			}
		});
	});
});
