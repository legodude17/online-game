/*jslint node:true*/
'use strict';
var OnlineGame = require('.');
var game = new OnlineGame(3000, function () {}, 'all', {}, true);
game.addStatic();
process.stdin.on('readable', function () {
  var a = process.stdin.read();
  if (a && a.toString() === 'send\n') {
    game.send('hi');
  }
});