# Running mocha tests in a docker container with Mocha Test Explorer

This is an example project for running mocha tests in a docker container with
[Mocha Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter).
It uses functionality from the
[vscode-test-adapter-remoting-util](https://github.com/hbenl/vscode-test-adapter-remoting-util)
package, which also contains more documentation on how to setup remote testing for your project.

To run the tests in this example project, you will need to have docker installed.
Run `docker pull node:current-alpine` to download the docker image used by this example project,
then you should be able to run the tests using Mocha Test Explorer.
If it doesn't work, have a look at the
[diagnostic log](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-mocha-test-adapter#user-content-troubleshooting)
to see why it fails.
