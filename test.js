/*jslint node:true*/
'use strict';
var OnlineGame = require('.');
var game = new OnlineGame(3000, function () {}, 'all', {}, true);
game.addStatic();