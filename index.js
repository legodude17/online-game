/*jslint node:true*/
'use strict';
var express = require('express');
var http = require('http');
var socket = require('socket.io');
var log = require('npmlog');
var CouchDbClient = require('couchdb-client');
var EE = require('events');
var util = require('util');
var OnlineGame = module.exports = function (port, cb, lvl, couchdbOpts, stdout) {
  if (stdout || stdout === undefined) {
    log.stream = process.stdout;
  }
  log.heading = 'OnlineGame';
  log.level = lvl || 'info';
  log.silly('Init', 'Set log level to', log.level);
  log.verbose('Init', 'Creating servers');
  port = port || 3000;
  this.app = express();
  this.server = http.createServer(this.app);
  this.io = socket(this.server);
  this.client = new CouchDbClient(couchdbOpts);
  this.server.listen(port, function () {
    log.http('Init', 'Server started on port', port);
    if (cb) {
      cb();
    }
  });
  this.connections = [];
  this.io.on('connection', function (socket) {
    var id = this.connections.length;
    log.info('Socket', 'Client', id, 'connected');
    this.emit('client:connection', socket);
    this.connections.push(socket);
    socket.on('error', function (err) {
      this.emit('error', err);
      log.error('Socket', err.stack);
    }.bind(this));
    socket.on('disconnect', function () {
      log.info('Socket', 'Client', id, 'disconnected');
      this.emit('client:disconnection', id);
      this.connections.splice(id, 1);
    });
  }.bind(this));
};
util.inherits(OnlineGame, EE);
OnlineGame.prototype.addStatic = function (dir) {
  this.app.use(express['static'](dir || './'));
};
OnlineGame.prototype.addFile = function (path, file) {
  this.app.get(path, function (req, res) {
    res.sendFile(file || path);
  });
};
OnlineGame.prototype.initDBs = function (dbs, cb) {
  var actual = ['users', 'maps'].concat(dbs),
    datas = [],
    errors = [];
  actual.forEach(function (v) {
    this.client.createDB(v, function (err, data) {
      if (err) {
        errors.push(err);
      } else {
        datas.push(data);
      }
      if (actual.length === datas.length + errors.length) {
        if (errors.length) {
          cb(errors);
        } else {
          cb(null, datas);
        }
      }
    });
  }.bind(this));
};