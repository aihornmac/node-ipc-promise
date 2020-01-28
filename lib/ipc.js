var utils = require('./utils');
var makeRequest = utils.makeRequest;
var makeResult = utils.makeResult;
var unserializeError = utils.unserializeError;
var getPropertyHost = utils.getPropertyHost;
var TOKEN = utils.TOKEN;

var ipcs = new Map();

function getIPC(proc) {
  proc = proc || process;
  var ipc = ipcs.get(proc);
  if (!ipc) {
    ipc = new IPC(proc);
    ipc.invade();
    ipcs.set(proc, ipc);
  }
  return ipc;
}

// define IPC
function IPC (proc) {
  Object.defineProperties(this, {
    _requests: { value: {} },
    _commands: { value: {} },
    _proc: { value: proc },
    _oldDescriptor: { writable: true },
    _getEmit: { value: getEmit.bind(this) },
    _setEmit: { value: setEmit.bind(this) },
    _newEmit: { value: emit.bind(this) }
  });
}

// (un)register responding functions
IPC.prototype.register = function IPCRegister (cmd, func) {
  if ('string' !== typeof cmd)
    throw new TypeError('cmd name should be String');
  if ('function' !== typeof func)
    throw new TypeError('cmd should be Function');
  var commands = this._commands;
  if (commands[cmd])
    throw new Error('command "' + cmd + '" has been registered');
  commands[cmd] = func;
  return this;
};

IPC.prototype.unregister = function IPCUnregister (cmd) {
  delete this._commands[cmd];
  return this;
};

// tell the other process to exec this
IPC.prototype.exec = function IPCExec(cmd) {
  if ('string' !== typeof cmd)
    throw new TypeError('cmd should be String');

  var proc = this._proc;

  // solve args
  var len = arguments.length;
  var args = new Array(len - 1);
  var i;
  for (i = 1; i < len; i++)
    args[i - 1] = arguments[i];

  // generate request promise
  var request = {};
  var promise = new Promise(function (resolve, reject) {
    this.resolve = resolve;
    this.reject = reject;
  }.bind(request));

  // make request
  var data = makeRequest(cmd, args);

  // add request to waiting
  this._requests[data.key] = request;

  // send request
  proc.send(data);

  return promise;
};

// hack into emit of process to prevent our requests from
// affecting others
function getEmit () {
  return this._newEmit;
}

function setEmit (value) {
  var descriptor = this._oldDescriptor;
  if (descriptor.writable || descriptor.set) {
    if (!('_assignEmit' in this)) {
      Object.defineProperty(this, '_assignEmit', { writable: true });
    }
    this._assignEmit = value;
  }
}

function emit (type, data) {
  if (type === 'message') {
    if (data && 'object' === typeof data) {
      if (data[TOKEN]) {
        // console.log(arguments);
        // when get here, it means the message is probably for us
        return IPCDispatch.call(this, data);
      }
    }
  }
  var target = this._proc.__proto__;
  return target.emit.apply(this._proc, arguments);
}

IPC.prototype.invade = function IPCInvade () {
  if (this._oldDescriptor) return;
  var proc = this._proc;
  var oldDescriptor;
  var newDescriptor = {
    get: this._getEmit,
    set: this._setEmit,
    configurable: true,
    enumerable: true
  };
  var host = getPropertyHost(proc, 'emit');

  if (host === proc) {
    oldDescriptor = Object.getOwnPropertyDescriptor(proc, 'emit');
  }
  if (oldDescriptor) {
    if (!oldDescriptor.configurable) {
      throw new Error('emit is not configurable');
    }
    newDescriptor.enumerable = oldDescriptor.enumerable;
  }

  this._oldDescriptor = oldDescriptor;
  Object.defineProperty(proc, 'emit', newDescriptor);
};

IPC.prototype.restore = function IPCRestore() {
  var descriptor = this._oldDescriptor;
  if (!descriptor) return;
  var proc = this._proc;
  delete proc.emit;
  if (this._oldDescriptor) {
    Object.defineProperty(proc, 'emit', descriptor);
  }
  if ('_assignEmit' in this) {
    proc.emit = this._assignEmit;
  }
};

function IPCDispatch(data) {
  try {
    var type = data.type;
    var key = data.key;
    if (type === 'result') {
      var requests = this._requests;
      var request = requests[key];
      if (!request) return false;
      delete requests[key];

      request.error = data.error;
      request.result = data.result;
      process.nextTick(dispatchResult.bind(request));

      return true;
    } else if (type === 'request') {
      var proc = this._proc;
      try {
        var name = data.name;
        var command = this._commands[name];
        if (!command) throw new Error("command '" + name + "' not found");

        Promise.resolve(command.apply(null, data.args))
        .catch(sendResponse.bind(proc, key))
        .then(sendResponse.bind(proc, key, null));

        return true;
      } catch (e) {
        sendResponse.call(proc, key, e);
        throw e;
      }
    }
  } catch (e) {
    console.error(e.stack || e);
  }
  return false;
}

function dispatchResult () {
  if (this.error) {
    this.reject(unserializeError(this.error));
  } else {
    this.resolve(this.result);
  }
}

function sendResponse (key, error, result) {
  var data = makeResult(key, error, result);
  this.send(data);
}

module.exports = getIPC;
