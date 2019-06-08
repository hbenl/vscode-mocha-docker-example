const { spawn } = require('child_process');
const { inspect } = require('util');
const { mochaWorker, convertPath, createConnection, writeMessage, readMessages } = require('vscode-test-adapter-remoting-util');

const localWorkspace = __dirname;

// the paths to use in the docker container
const remoteHome = '/home/node';
const remoteWorker = remoteHome + '/worker.js';
const remoteWorkspace = remoteHome + '/workspace';

// this port will be used for the communication channel between the launcher and worker scripts
const port = 8123;

// any string that is sent to Mocha Test Explorer is added to the diagnostic log (if it is enabled)
const log = msg => process.send(msg);

// these functions convert the paths between the local and remote environments
const localToRemotePath = path => convertPath(path, localWorkspace, remoteWorkspace);
const remoteToLocalPath = path => convertPath(path, remoteWorkspace, localWorkspace);

// receive the first message of the worker protocol from the Mocha Test Explorer
process.once('message', async origWorkerArgs => {

	log('Received workerArgs');

	// convert the paths in the `WorkerArgs` for the remote environment
	const workerArgs = mochaWorker.convertWorkerArgs(origWorkerArgs, localToRemotePath);

	// if the tests should be run in the debugger, we need to pass extra arguments to node to enable the debugger
	// and to docker to expose the debugger port
	let nodeDebugArgs = [];
	let dockerDebugArgs = [];
	let rejectClosedSocket = undefined;
	if (workerArgs.debuggerPort) {
		nodeDebugArgs = [ `--inspect-brk=0.0.0.0:${workerArgs.debuggerPort}` ]
		dockerDebugArgs = [ '-p', `${workerArgs.debuggerPort}:${workerArgs.debuggerPort}` ];
		rejectClosedSocket = 1500;
	}

	// start a child process that will run the worker script in a docker container
	log('Starting worker process');
	const childProcess = spawn(
		'docker',
		[
			// create and start the container and remove it when it is finished
			'run', '--rm',

			// bind-mount this workspace folder into the container
			'-v', `${localWorkspace}:${remoteWorkspace}`,

			// bind-mount the worker script into the container
			'-v', `${origWorkerArgs.workerScript}:${remoteWorker}`,

			// expose the port for the worker protocol
			'-p', `${port}:${port}`,

			// optionally expose the node debugger port
			...dockerDebugArgs,

			// set the hostname of the docker container (used in one of the tests to check if it is running in the container)
			'-h', 'mocha-container',

			// the container image to use
			'node:current-alpine',

			// we want to run node in the container
			'node',

			// optionally enable the node debugger
			...nodeDebugArgs,

			// we want node to run the bind-mounted worker script
			remoteWorker,

			// this tells the worker script to accept a connection for the worker protocol on the given port
			`{"role":"server","port":${port}}`
		],

		// we use 'inherit' to forward the messages on `stdout` and `stderr` from the child process
		// to this process, so they can be received by Mocha Test Explorer
		{ stdio: 'inherit' }
	);

	// report error events from the child process to the diagnostic log of Mocha Test Explorer
	childProcess.on('error', err => log(`Error from docker: ${inspect(err)}`));

	// write a log message when the child process exits
	childProcess.on('exit', (code, signal) => {
		log(`The docker process exited with code ${code} and signal ${signal}.`);

		// if the child process should have loaded the tests but exited abnormally,
		// we send an `ErrorInfo` object so that the error is shown in the Test Explorer UI
		if ((workerArgs.action === 'loadTests') && (code || signal)) {
			process.send({ type: 'finished', errorMessage: `The docker process exited with code ${code} and signal ${signal}.\nThe diagnostic log may contain more information, enable it with the "mochaExplorer.logpanel" or "mochaExplorer.logfile" settings.` });
		}
	});

	// establish the TCP/IP connection to the worker
	log('Connecting to worker process');
	const socket = await createConnection(port, { rejectClosedSocket });

	// forward the `WorkerArgs` that we received earlier from Mocha Test Explorer to the worker
	log('Sending workerArgs to worker process');
	await writeMessage(socket, workerArgs);

	log('Finished initialising worker');

	// receive the results from the worker, translate any paths in them and forward them to Mocha Test Explorer
	readMessages(socket, msg => {
		if (workerArgs.action === 'loadTests') {
			process.send(mochaWorker.convertTestLoadMessage(msg, remoteToLocalPath));
		} else {
			process.send(mochaWorker.convertTestRunMessage(msg, remoteToLocalPath));
		}
	});
});
