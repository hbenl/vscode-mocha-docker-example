# Running mocha tests in a docker container with Mocha Test Explorer

This is a sample project for running mocha tests in a docker container with [Mocha Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter).
It uses the docker [launcher script](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter#running-tests-remotely) from https://github.com/hbenl/mocha-explorer-launcher-scripts.

To run the tests in this project, you will need to have docker installed.
Run `docker pull node:current-alpine` to download the docker image used by this sample project, then you should be able to run the tests using Mocha Test Explorer.
If it doesn't work, have a look at the [diagnostic log](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter#troubleshooting) to see why it fails.
