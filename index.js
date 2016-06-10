/*jslint node:true*/
'use strict';
var express = require('express');
var http = require('http');
var socket = require('socket.io');
var log = require('npmlog');
var CouchDbClient = require('couchdb-client');
var OnlineGame = module.exports = function (port, cb, lvl, couchdbOpts) {
  log.heading = 'OnlineGame';
  log.level = lvl || 'info';
  log.silly('Init', 'Set log level to', log.level);
  log.verbose('Init', 'Creating servers');
  port = port || 3000;
  this.app = express();
  this.server = http.createServer(this.app);
  this.io = socket(this.server);
  this.client = new CouchDbClient(couchdbOpts);
  this.app.listen(port, function () {
    if (cb) {
      cb();
    }
    log.http('Init', 'Server started on port', port);
  });
};