/*jslint node:true*/
'use strict';
var acorn = require('acorn'),
  ASQ = require('asynquence'),
  fs = require('fs'),
  readdir = require('readdir'),
  path = require('path'),
  JSONStream = require('JSONStream'),
  request = require('request'),
  concat = require('concat-stream'),
  magicpen = require('magicpen'),
  isCore = require('is-core-module'),
  command = require('./commands'),
  install = require('./install'),
  targz = require('tar.gz');
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
    cb(null, dirs);
  });
}
function getContentsOfNodeModules(place, cb) {
  getFoldersInDir(path.join(place, 'node_modules'), cb);
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
function write(output, input, pen, done) {
  output.write(pen.toString(input.format || (input.output ? 'text' : 'ansi')), function (err) {
    if (err) {
      done.fail(err);
    }
    if (input.log && input.output) {
      console.log(pen.toString('ansi'));
    }
    process.exit(0);
  });
}
function getOutput(input, done, msg) {
  var output, file;
  if (input.output) {
    file = path.resolve(input.output);
    create(file, function (err) {
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
}
function getDepsFromPackage(folder, cb) {
  function handle(data) {
    data = data[0];
    cb(null, {
      normal: data.dependencies,
      dev: data.devDependencies
    });
  }
  fs.access(path.join(folder, 'package.json'), fs.F_OK, function (err) {
    if (err) {
      fs.createReadStream(path.join(process.cwd(), 'node_modules', folder, 'package.json')).pipe(JSONStream.parse()).pipe(concat(handle));
    } else {
      fs.createReadStream(path.join(folder, 'package.json')).pipe(JSONStream.parse()).pipe(concat(handle));
    }
  });
}
function getLongest(obj) {
  var max = 0;
  Object.keys(obj).forEach(function (i) {
    max = Math.max(max, (i + '  ' + obj[i]).length);
  });
  return max;
}
function fetch(name, place, deps, dev, not) {
  not = not || [];
  ASQ(function (done) {
    function handle(pkg) {
      pkg = pkg[0];
      if (!pkg.versions) {
        done.fail(new Error('Package ' + name + ' not found.'));
        return;
      }
      var data;
      data = getLatestVersion(pkg);
      done({
        name: pkg.name,
        place: data.dist.tarball,
        deps: data.dependencies,
        dev: data.devDependencies
      });
    }
    request('http://registry.npmjs.org/' + name).pipe(JSONStream.parse()).pipe(concat(handle));
  }).then(function (done, msg) {
    request(msg.place).pipe(targz().createWriteStream(path.join(place, msg.name)));
    if (deps && msg.deps) {
      msg.deps.forEach(function (v) {
        fetch(pkg, deps, dev, not.concat(deps));
      });
    }
    if (dev && msg.dev) {
      msg.dev.forEach(function (v) {
        fetch(pkg, deps, dev, not.concat(dev));
      });
    }
  })
}
var commands = {
  find: {
    action: function (done, args, input) {
      var output, file = args[0];
      ASQ(function (done) {
        if (input.evaluate) {
          done(input.evaluate);
        } else {
          fs.readFile(file, 'utf-8', done.errfcb);
        }
      }).then(function (done, msg) {
        getOutput(input, done, msg);
      }).then(function (done, msg) {
        if (input.dev) {
          getDepsFromPackage(process.cwd(), function (err, data) {
            msg.devDeps = Object.keys(data.dev);
            done(msg);
          });
        } else {
          done(msg);
        }
      }).then(function (done, msg) {
        var pen = magicpen(), i, v, length1, length2, text, start = Date.now(), length3, output, length4, devDeps;
        output = msg.output;
        devDeps = msg.devDeps;
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
          if (input.dev) {
            text += '         |Is dev:';
          }
          length1 = text.split('|')[0].length;
          length2 = text.split('|')[1].length;
          length3 = text.split('|')[2].length;
          pen.outdentLines().green(text).nl().text('-'.repeat(text.length));
          pen.nl();
          for (i in msg.required) {
            if (msg.required.hasOwnProperty(i)) {
              v = msg.required[i];
              pen.text(i + ' '.repeat(length1 - i.length) + '| ' + v + ' '.repeat(length2 - v.length - 1) +   '|').sp().blue(isCore(v));
              if (input.dev) {
                pen.text(' '.repeat(length3 - isCore(v).toString().length) + '|').sp().blue(devDeps.includes(v));
              }
              pen.nl();
            }
          }
        }
        write(output, input, pen, done);
      }).or(function (err) {
        done.fail(err);
      });
    },
    description: 'Find the requires in a file',
    args: '<file>',
    options: {
      '-e, --evaluate <text>': 'Evaluate given text',
      '-o, --output <file>': 'Output to given file',
      '-t, --table': 'Output a table',
      '-l, --list': 'Output in a list',
      '--log': 'Output to the log, or process.stdout',
      '-d, --dev': 'Output if something is a dev dep',
      '-f, --format <format>': 'Use format format'
    },
    alias: 'f'
  },
  get: {
    action: function (done, args, options) {
      ASQ(function (done) {
        if (options.web) {
          getDepsFromPackageWeb(args[0], null, done.errfcb);
        } else {
          getDepsFromPackage(args[0], done.errfcb);
        }
      }).then(function (done, msg) {
        getOutput(options, done, msg);
      }).then(function (done, msg) {
        var pen = magicpen(), len;
        pen.green('Finished').nl();
        if (Object.keys(msg.text.normal).length) {
          pen.green('Normal dependencies:').nl();
          len = getLongest(msg.text.normal);
          Object.keys(msg.text.normal).forEach(function (i) {
            pen.text(i).sp(len - (i.length + msg.text.normal[i].length)).text(msg.text.normal[i]).nl();
          });
        }
        if (Object.keys(msg.text.dev).length) {
          pen.green('Development dependencies:').nl();
          len = getLongest(msg.text.dev);
          Object.keys(msg.text.dev).forEach(function (i) {
            pen.text(i).sp(len - (i.length + msg.text.dev[i].length)).text(msg.text.dev[i]).nl();
          });
        }
        write(msg.output, options, pen, done);
      }).then(done).or(function (err) {
        done.fail(err);
      });
    },
    description: 'Get dependencies from package.json',
    args: '<pkg>',
    options: {
      '-w, --web': 'Get from the web.',
      '-f, --format <format>': 'Use the given format',
      '-o, --output <file>': 'Output to given file'
    }
  },
  "install": {
    action: function (done, args, options) {
      var file = args[0];
      ASQ(function (done) {
        fs.readFile(path.resolve(file), done.errfcb);
      }).then(function (done, msg) {
        done(findRequiresInText(msg));
      }).then(function (done, msg) {
        getOutput(options, done, msg);
      }).then(function (done, msg) {
        getContentsOfNodeModules(path.dirname(file), function (err, data) {
          if (err) {
            done.fail(err);
            return;
          }
          msg.installed = data;
          done(msg);
        });
      }).then(function (done, msg) {
        var missing = msg.text.requires.filter(function (v) {
          return !msg.installed.includes(v);
        });
        if (!missing.length) {
          console.log(magicpen().yellow('No missing dependencies.').toString('ansi'));
          done(false);
        } else {
          install(missing.filter(function (v) {return !isCore(v); })).then(
            function (a, data) {
              done({
                old: msg.installed,
                'new': missing,
                data: data
              });
            }
          ).or(done.fail);
        }
      }).then(function (a, msg) {
        if (msg) {
          console.log(msg);
          done();
          return;
        }
        done();
      });
    },
    description: 'Read a file for missing dependencies and install them.',
    args: '<file>',
    options: {
      
    }
  },
  fetch: {
    action: function (done, args, options) {
      var pkg = args[0], place = args[1] || process.cwd();
      fetch(pkg, place, options.deps, options.dev);
    },
    description: 'Fetch a package from npm.',
    args: '<pkg>',
    options: {
      '-d, --dev': 'Install dev deps.',
      '-p, --deps': 'Install deps.'
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
    console.error(pen.toString('ansi'));
  });
};