#! /usr/bin/node
/*jslint node:true*/
'use strict';
var command = require('./commands');
var commands = {
    print: {
        action: function (done, args, options) {
            console.log((options.color ? options.color + ': ' : '') + args[0]);
            done(0);
        },
        description: 'print the string',
        args: '<string>',
        options: {
            '-c, --color <color>': 'use color color'
        }
    },
    die: {
        action: function (done, args, options) {
            console.log('Dead');
            done(0);
        },
        description: 'die',
        args: ''
    }
};
command(process.argv, commands, process.exit);