/*jslint node:true*/
'use strict';
var acorn = require('acorn'),
    ASQ = require('asynquence'),
    fs = require('fs'),
    util = require('util'),
    readdir = require('readdir'),
    path = require('path'),
    JSONStream = require('JSONStream'),
    request = require('request'),
    concat = require('concat-stream'),
    magicpen = require('magicpen'),
    isCore = require('is-core-module'),
    command = require('./commands');
function findRequiresInText(txt) {
    var tokens = [],
        results = {},
        data,
        token;
    results.requires = [];
    results.required = {};
    data = acorn.tokenizer(txt);
    while ((token = data.getToken()).type.label !== 'eof') {
        tokens.push(token);
    }
    function nextToken(i, x) {
        x = x || 1;
        return tokens[i + x];
    }
    function prevToken(i, x) {
        x = x || 1;
        return tokens[i - x];
    }
    tokens.forEach(function (token, i) {
        if (token.type.label === 'name' && token.value === 'require') {
            if (nextToken(i, 1).type.label === '(' && nextToken(i, 3).type.label === ')' && nextToken(i, 2).type.label === 'string') {
                results.requires.push(nextToken(i, 2).value);
                results.required[prevToken(i, 2).value] = nextToken(i, 2).value;
            }
        }
    });
    results.tokens = tokens;
    return results;
}
function getFoldersInDir(path, cb) {
    readdir.read(path, function (err, data) {
        if (err) {
            cb(err);
        }
        var dirs = [];
        data.forEach(function (v) {
            if (!dirs.includes(v.split('/')[0])) {
                dirs.push(v.split('/')[0]);
            }
        });
        return dirs;
    });
}
function getContentsOfNodeModules(place, cb) {
    getFoldersInDir(path.join(place, 'node_modules'), cb);
}
function getDepsFromModules(place, cb) {
    place = path.join(place, 'package.json');
    fs.readFile(place, 'utf-8', function (err, data) {
        if (err) {
            cb(err);
        }
        data = JSON.parse(data);
        cb(null, {
            dev: data.devDependencies,
            normal: data.dependencies
        });
    });
}
function greaterVersion(v1, v2) {
    var ver1, ver2;
    ver1 = v1.split('.').map(function (v) {
        return parseInt(v, 10);
    });
    ver2 = v2.split('.').map(function (v) {
        return parseInt(v, 10);
    });
    if (ver1[0] > ver2[0]) {
        return v1;
    } else if (ver1[0] < ver2[0]) {
        return v2;
    } else if (ver1[1] < ver2[1]) {
        return v2;
    } else if (ver1[1] > ver2[1]) {
        return v1;
    } else if (ver1[2] < ver2[2]) {
        return v2;
    } else if (ver1[2] > ver2[2]) {
        return v1;
    } else {
        return v1;
    }
}
function getLatestVersion(pkg) {
    var latest = '0.0.0',
        versions = pkg.versions,
        i;
    for (i in versions) {
        if (versions.hasOwnProperty(i)) {
            latest = greaterVersion(latest, i);
        }
    }
    return versions[latest];
}
function getDepsFromPackageWeb(name, version, cb) {
    function handle(pkg) {
        pkg = pkg[0];
        if (!pkg.versions) {
            cb(new Error('Package ' + name + ' not found.'));
            return;
        }
        var data;
        if (!version) {
            data = getLatestVersion(pkg);
        }
        data = pkg.versions[version];
        if (!data) {
            data = getLatestVersion(pkg);
        }
        cb(null, {
            normal: data.dependencies,
            dev: data.devDependencies
        });
    }
    request('http://registry.npmjs.org/' + name).pipe(JSONStream.parse()).pipe(concat(handle));
}
function create(file, cb) {
    fs.access(file, fs.F_OK, function (err) {
        if (err) {
            fs.appendFile(file, '', cb);
        } else {
            cb(null);
        }
    });
}
var setup = {
    find: function (done, msg, file) {
        
    }
};
var commands = {
    find: {
        action: function (done, args, input) {
            var output, file = args.file || args[0];
            ASQ(function (done) {
                if (input.input) {
                    fs.readFile(file, 'utf-8', done.errfcb);
                } else {
                    done(input.evaluate);
                }
            }).then(function (done, msg) {
                if (input.output) {
                    file = path.resolve(input.output);
                    create(file, function (err, data) {
                        if (err) {
                            return done.fail(err);
                        }
                        output = fs.createWriteStream(file);
                        done({
                            text: msg,
                            output: output
                        });
                    });
                } else {
                    output = process.stdout;
                    done({
                        text: msg,
                        output: output
                    });
                }
            }).then(function (done, msg) {
                var pen = magicpen(), i, v, length, length1, length2, text, start = Date.now(), length3, output;
                output = msg.output;
                msg = findRequiresInText(msg.text);
                pen.green('Finished in ~').green(Date.now() - start).green('ms.');
                if (input.list) {
                    pen.nl().green('Required Modules:').nl();
                    msg.requires.forEach(function (v) {
                        pen.text('\t' + v).nl();
                    });
                }
                if (input.table) {
                    text = 'Variable name:   |Module name:     |Is core:';
                    length = text.length;
                    length1 = text.split('|')[0].length;
                    length2 = text.split('|')[1].length;
                    length3 = text.split('|')[2].length;
                    pen.outdentLines().green(text).nl().text('-'.repeat(text.length)).nl();
                    for (i in msg.required) {
                        if (msg.required.hasOwnProperty(i)) {
                            v = msg.required[i];
                            pen.text(i + ' '.repeat(length1 - i.length) + '| ' + v + ' '.repeat(length2 - v.length - 1) +   '|').sp().blue(isCore(v));
                            pen.nl();
                        }
                    }
                }
                output.write(pen.toString(input.format || (input.output ? 'text' : 'ansi')), function (err) {
                    if (err) {
                        done.fail(err);
                    }
                    if (input.log && !input.output) {
                        console.log(pen.toString(input.format || 'ansi'));
                    }
                    process.exit(0);
                });
            });
        }, 
        describtion: 'Find the requires in a file',
        usage: 'deps find <file> [options]',
        options: {
            '-e, --evaluate <text>': 'Evaluate given text',
            '-o, --output <file>': 'Output to given file',
            '-t, --table': 'Output a table',
            '-l, --list': 'Output in a list',
            '--log': 'Output to the log, or process.stdout'
        }
    }
};
module.exports = function (argv, name) {
    ASQ(function (done) {
        command(argv, commands, done);
    }).or(function (err) {
        var pen = magicpen(), oPen = magicpen(), stack = err.stack.split('\n');
        stack = stack.splice(1);
        oPen.yellow(stack.join('\n'));
        pen.red('Error:').sp().text(err.message).nl().block(oPen);
        console.log(pen.toString('ansi'));
    });
};