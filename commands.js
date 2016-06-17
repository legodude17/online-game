/*jslint node:true*/
'use strict';
var program = require('commander'), fs = require('fs'), path = require('path');
function doCommand(func, cb) {
  return function () {
    func(cb, Array.prototype.slice.call(arguments, 0, -1), arguments[arguments.length - 1]);
  };
}
function getVersion() {
  return JSON.parse(fs.readFileSync(path.resolve('./package.json'))).version;
}
function command(argv, commands, cb) {
  var i, c, j, o, cc;
  program.version(getVersion());
  for (i in commands) {
    if (commands.hasOwnProperty(i)) {
      c = commands[i];
      cc = program.command(i + ' ' + c.args).description(c.description);
      if (c.alias) {
        cc.alias(c.alias);
      }
      for (j in c.options) {
        if (c.options.hasOwnProperty(j)) {
          o = c.options[j];
          cc.option(j, o);
        }
      }
      cc.action(doCommand(c.action, cb));
    }
  }
  program.parse(argv);
}
module.exports = command;