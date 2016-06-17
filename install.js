/*jslint node:true*/
'use strict';
var ASQ = require('asynquence'),
  path = require('path'),
  exec = require('child_process').exec;
module.exports = function i(pkgs) {
  return ASQ(function (done) {
    exec('npm i --save ' + pkgs.join(' '), done.errfcb);
  });
};