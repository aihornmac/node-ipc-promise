# node-ipc-promise

A Node.js tool for ipc in promise style with following features

* returns promises
* not affecting original process event emitter

this module requires **Promise** and **WeakMap**,
you should use polyfill or shim if they are not
supported natively

## Installation
```bash
npm install node-ipc-promise
```

## Basic Usage

Parent process
```js
var child_process = require('child_process');
var child = child_process.fork(/* the child script */);

var IPC = require('node-ipc-promise');
var ipc = IPC(child);

ipc.register('greet', function (greeting) {
  console.log(greeting);
  return Promise.resolve('Hi, I am parent.');
});

ipc.exec('greet', 'Hi there.').then(function (greeting) {
  console.log(greeting);
});
```

Child process
```js
var IPC = require('node-ipc-promise');
var ipc = IPC();

// prevent process from exiting immediately
setTimeout(function () {}, 100);

ipc.register('greet', function (greeting) {
  console.log(greeting);
  return ipc.exec('greet', 'Hi, I am child.');
});
```

the output may look like
```
Hi there.
Hi, I am child.
Hi, I am parent.
```

it can also be coded in es6 style with es7 async/await,
which may output similar results

Parent process
```js
import { fork } from 'child_process';
let child = fork(/* the child script */);

import IPC from 'node-ipc-promise';
let ipc = IPC(child);

ipc.register('greet', (greeting) => {
  console.log(greeting);
  return Promise.resolve('Hi, I am parent.');
});

(async () => {
  let greeting = await ipc.exec('greet', 'Hi there.');
  console.log(greeting);
})();
```

Child process
```js
import IPC from 'node-ipc-promise';
let ipc = IPC(child);

// prevent process from exiting immediately
setTimeout(() => {}, 100);

ipc.register('greet', (greeting) => {
  console.log(greeting);
  return ipc.exec('greet', 'Hi, I am child.');
});
```
## APIs
```js
ipc.exec(command[, arg1][, arg2][, ...]);
```
```js
ipc.register(command, handler);
```
```js
ipc.unregister(command);
```
```js
ipc.invade();
```
```js
ipc.restore();
```
