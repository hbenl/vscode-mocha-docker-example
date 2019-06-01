const { spawn } = require('child_process');
const { inspect } = require('util');
const { mochaWorker, convertPath, createConnection, writeMessage, readMessages } = require('vscode-test-adapter-remoting-util');

const localWorkspace = __dirname;
const remoteHome = '/home/node';
const remoteWorker = remoteHome + '/worker.js';
const remoteWorkspace = remoteHome + '/workspace';
const port = 8123;

const log = msg => process.send(msg);
const localToRemotePath = path => convertPath(path, localWorkspace, remoteWorkspace);
const remoteToLocalPath = path => convertPath(path, remoteWorkspace, localWorkspace);

process.once('message', async origWorkerArgs => {

	log('Received workerArgs');

	const workerArgs = mochaWorker.convertWorkerArgs(origWorkerArgs, localToRemotePath);

	let nodeDebugArgs = [];
	let dockerDebugArgs = [];
	let rejectClosedSocket = undefined;
	if (workerArgs.debuggerPort) {
		nodeDebugArgs = [ `--inspect-brk=0.0.0.0:${workerArgs.debuggerPort}` ]
		dockerDebugArgs = [ '-p', `${workerArgs.debuggerPort}:${workerArgs.debuggerPort}` ];
		rejectClosedSocket = 1500;
	}

	log('Starting worker process');
	const childProcess = spawn(
		'docker',
		[
			'run', '--rm',
			'-v', `${origWorkerArgs.workerScript}:${remoteWorker}`,
			'-v', `${localWorkspace}:${remoteWorkspace}`,
			'-w', localToRemotePath(process.cwd()),
			'-p', `${port}:${port}`,
			...dockerDebugArgs,
			'node:current-alpine',
			'node',
			...nodeDebugArgs,
			remoteWorker, `{"role":"server","port":${port}}`
		],
		{ stdio: 'inherit' }
	);

	childProcess.on('error', err => log(`Error from docker: ${inspect(err)}`));
	childProcess.on('exit', (code, signal) => {
		log(`The docker process exited with code ${code} and signal ${signal}.`);
		if ((workerArgs.action === 'loadTests') && (code || signal)) {
			process.send({ type: 'finished', errorMessage: `The docker process exited with code ${code} and signal ${signal}.\nThe diagnostic log may contain more information, enable it with the "mochaExplorer.logpanel" or "mochaExplorer.logfile" settings.` });
		}
	});

	log('Connecting to worker process');
	const socket = await createConnection(port, { rejectClosedSocket });

	log('Sending workerArgs to worker process');
	await writeMessage(socket, workerArgs);

	log('Finished initialising worker');

	readMessages(socket, msg => {
		if (workerArgs.action === 'loadTests') {
			process.send(mochaWorker.convertTestLoadMessage(msg, remoteToLocalPath));
		} else {
			process.send(mochaWorker.convertTestRunMessage(msg, remoteToLocalPath));
		}
	});
});
