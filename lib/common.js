/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var assert = require('assert-plus');
var child_process = require('child_process');
var format = require('util').format;
var fs = require('fs');
var os = require('os');
var path = require('path');
var tty = require('tty');

var read = require('read');
var VError = require('verror');

// ---- support stuff

function objCopy(obj, target) {
    assert.object(obj, 'obj');
    assert.optionalObject(obj, 'target');

    if (target === undefined) {
        target = {};
    }
    Object.keys(obj).forEach(function aKey(k) {
        target[k] = obj[k];
    });
    return target;
}

/**
 * given an array return a string with each element
 * JSON-stringifed separated by newlines
 */
function jsonStream(arr, stream) {
    stream = stream || process.stdout;

    arr.forEach(function anElem(elem) {
        stream.write(JSON.stringify(elem) + '\n');
    });
}

/**
 * return how long ago something happened
 *
 * @param {Date} when - a date object in the past
 * @param {Date} now (optional) - a date object to compare to
 * @return {String} - printable string
 */
function longAgo(when, now) {
    now = now || new Date();
    assert.date(now, 'now');

    var seconds = Math.round((now - when) / 1000);
    // prettier-ignore
    var times = [
        seconds / 60 / 60 / 24 / 365, // years
        seconds / 60 / 60 / 24 / 7,   // weeks
        seconds / 60 / 60 / 24,       // days
        seconds / 60 / 60,            // hours
        seconds / 60,                 // minutes
        seconds                       // seconds
    ];
    var names = ['y', 'w', 'd', 'h', 'm', 's'];

    for (var i = 0; i < names.length; i++) {
        var time = Math.floor(times[i]);
        if (time > 0) return format('%d%s', time, names[i]);
    }
    return '0s';
}

/*
 * take some basic information and return node-cmdln options suitable for
 * tabula
 *
 * @param {String} (optional) opts.columnDefault Default value for `-o`
 * @param {String} (optional) opts.sortDefault Default value for `-s`
 * @param {String} (optional) opts.includeLong Include `-l` option
 * @return {Array} Array of cmdln options objects
 */
function getCliTableOptions(opts) {
    opts = opts || {};
    assert.object(opts, 'opts');
    assert.optionalArrayOfString(opts.columnsDefault, 'opts.columnsDefault');
    assert.optionalArrayOfString(opts.sortDefault, 'opts.sortDefault');
    assert.optionalBool(opts.includeLong, 'opts.includeLong');

    var o;

    // construct the options object
    var tOpts = [];

    // header
    tOpts.push({
        group: 'Output options'
    });

    // -H
    tOpts.push({
        names: ['H'],
        type: 'bool',
        default: false,
        help: 'Omit table header row.'
    });

    // -o field1,field2,...
    o = {
        names: ['o'],
        type: 'commaSepString',
        help: 'Specify fields (columns) to output.',
        helpArg: 'field1,...'
    };
    if (opts.columnsDefault) {
        o.default = opts.columnsDefault;
    }
    tOpts.push(o);

    // -l, --long
    if (opts.includeLong) {
        tOpts.push({
            names: ['long', 'l'],
            type: 'bool',
            help: 'Long/wider output. Ignored if "-o ..." is used.'
        });
    }

    // -s field1,field2,...
    o = {
        names: ['s'],
        type: 'commaSepString',
        help: 'Sort on the given fields.',
        helpArg: 'field1,...'
    };
    if (opts.sortDefault) {
        o.default = opts.sortDefault;
        o.help = format('%s Default is "%s".', o.help, opts.sortDefault);
    }
    tOpts.push(o);

    // -j, --json
    tOpts.push({
        names: ['json', 'j'],
        type: 'bool',
        help: 'JSON stream output.'
    });

    return tOpts;
}

/**
 * Prompt a user for a y/n answer.
 *
 *      cb('y')        user entered in the affirmative
 *      cb('n')        user entered in the negative
 *      cb(false)      user ^C'd
 *
 * Dev Note: Borrowed from imgadm's common.js. If this starts showing issues,
 * we should consider using the npm 'read' module.
 */
function promptYesNo(opts_, cb) {
    assert.object(opts_, 'opts');
    assert.string(opts_.msg, 'opts.msg');
    assert.optionalString(opts_.default, 'opts.default');
    var opts = objCopy(opts_);

    // Setup stdout and stdin to talk to the controlling terminal if
    // process.stdout or process.stdin is not a TTY.
    var stdout;
    if (opts.stdout) {
        stdout = opts.stdout;
    } else if (process.stdout.isTTY) {
        stdout = process.stdout;
    } else {
        opts.stdout_fd = fs.openSync('/dev/tty', 'r+');
        stdout = opts.stdout = new tty.WriteStream(opts.stdout_fd);
    }
    var stdin;
    if (opts.stdin) {
        stdin = opts.stdin;
    } else if (process.stdin.isTTY) {
        stdin = process.stdin;
    } else {
        opts.stdin_fd = fs.openSync('/dev/tty', 'r+');
        stdin = opts.stdin = new tty.ReadStream(opts.stdin_fd);
    }

    stdout.write(opts.msg);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    var input = '';
    stdin.on('data', onData);

    function postInput() {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.write('\n');
        stdin.removeListener('data', onData);
    }

    function finish(rv) {
        if (opts.stdout_fd !== undefined) {
            stdout.end();
            delete opts.stdout_fd;
        }
        if (opts.stdin_fd !== undefined) {
            stdin.end();
            delete opts.stdin_fd;
        }
        cb(rv);
    }

    function onData(ch) {
        ch = ch + '';

        switch (ch) {
            case '\n':
            case '\r':
            case '\u0004':
                // EOT. They've finished typing their answer
                postInput();
                var answer = input.toLowerCase();
                if (answer === '' && opts.default) {
                    finish(opts.default);
                } else if (answer === 'yes' || answer === 'y') {
                    finish('y');
                } else if (answer === 'no' || answer === 'n') {
                    finish('n');
                } else {
                    stdout.write('Please enter "y", "yes", "n" or "no".\n');
                    promptYesNo(opts, cb);
                    return;
                }
                break;
            case '\u0003': // Ctrl C
                postInput();
                finish(false);
                break;
            case '\u007f': // DEL
                input = input.slice(0, -1);
                stdout.clearLine();
                stdout.cursorTo(0);
                stdout.write(opts.msg);
                stdout.write(input);
                break;
            default:
                // Rule out special ASCII chars.
                var code = ch.charCodeAt(0);
                if (code >= 0 && code <= 31) {
                    break;
                }
                // More plaintext characters
                stdout.write(ch);
                input += ch;
                break;
        }
    }
}

/*
 * Prompt and wait for <Enter> or Ctrl+C. Usage:
 *
 *      common.promptEnter('Press <Enter> to re-edit, Ctrl+C to abort.',
 *          function (err) {
 *              if (err) {
 *                  // User hit Ctrl+C
 *              } else {
 *                  // User hit Enter
 *              }
 *          }
 *      );
 */
function promptEnter(prompt, cb) {
    read(
        {
            prompt: prompt
        },
        function onRead(err) {
            cb(err);
        }
    );
}

/*
 * Parse the given line into an argument vector, e.g. for use in sending to
 * `child_process.spawn(argv[0], argv.slice(1), ...)`.
 *
 * Translated from the Python `line2argv` in https://github.com/trentm/cmdln
 * See also the tests in "test/unit/argvFromLine.test.js".
 *
 * @throws {Error} if there are unbalanced quotes or some other parse failure.
 */
function argvFromLine(line) {
    assert.string(line, 'line');

    // prettier-ignore
    var SQUOTE = '\'';
    var DQUOTE = '"';

    var trimmed = line.trim();
    var argv = [];
    var state = 'default';
    var arg = null; // the current argument being parsed
    var i = -1;
    var WHITESPACE = {
        ' ': true,
        '\t': true,
        '\n': true,
        '\r': true
        // Other whitespace chars?
    };

    var YUP = true; // workaround eslint no-constant-condition
    while (YUP) {
        i += 1;
        if (i >= trimmed.length) {
            break;
        }
        var ch = trimmed[i];

        // An escaped char always added to the arg.
        if (ch === '\\' && i + 1 < trimmed.length) {
            if (arg === null) {
                arg = '';
            }
            /*
             * Include the escaping backslash, unless it is escaping a quote
             * inside a quoted string. E.g.:
             *      foo\Xbar    =>  foo\Xbar
             *      'foo\'bar'  =>  foo'bar
             *      "foo\"bar"  =>  foo"bar
             *
             * Note that cmdln.py's line2argv had a Windows-specific subtlety
             * here (dating to cmdln commit 87430930160f) that we are skipping
             * for now.
             */
            if (
                (state === 'double-quoted' && trimmed[i + 1] !== DQUOTE) ||
                (state === 'single-quoted' && trimmed[i + 1] !== SQUOTE)
            ) {
                arg += ch;
            }
            i += 1;
            arg += trimmed[i];
            continue;
        }

        if (state === 'single-quoted') {
            if (ch === SQUOTE) {
                state = 'default';
            } else {
                arg += ch;
            }
        } else if (state === 'double-quoted') {
            if (ch === DQUOTE) {
                state = 'default';
            } else {
                arg += ch;
            }
        } else if (state === 'default') {
            if (ch === DQUOTE) {
                if (arg === null) {
                    arg = '';
                }
                state = 'double-quoted';
            } else if (ch === SQUOTE) {
                if (arg === null) {
                    arg = '';
                }
                state = 'single-quoted';
            } else if (WHITESPACE.hasOwnProperty(ch)) {
                if (arg !== null) {
                    argv.push(arg);
                }
                arg = null;
            } else {
                if (arg === null) {
                    arg = '';
                }
                arg += ch;
            }
        }
    }
    if (arg !== null) {
        argv.push(arg);
    }

    /*
     * Note: cmdln.py's line2argv would not throw this error on Windows, i.e.
     * allowing unclosed quoted-strings. This impl. is not following that lead.
     */
    if (state !== 'default') {
        throw new Error(
            format('unfinished %s segment in line: %j', state, line)
        );
    }

    return argv;
}

/**
 * Edit the given text in $EDITOR (defaulting to `vi`) and return the edited
 * text.
 *
 * This callback with `cb(err, updatedText, changed)` where `changed`
 * is a boolean true if the text was changed.
 *
 * @param {Object} opts
 *      - @param {String} opts.text
 *      - @param {String} opts.filename - The suffix of the basename of the
 *        temp file created for editing, or if the filename contains a '/' it is
 *        treated as the full path of the tmp file to edit.
 *      - @param {Boolean} opts.noUnlink - Set to true to have this function
 *        *not* unlink (delete) the temp file after editing.
 *      - @param {Number} opts.line - Optional. If given it should be a
 *        positive 1-based integer line number in the given text at which to
 *        set the cursor when editing. Currently this assumes the vi/emacs
 *        "+[num]" syntax is supported.
 *      - @param {Bunyan Logger} opts.log
 */
function editInEditor(opts, cb) {
    assert.string(opts.text, 'opts.text');
    assert.optionalString(opts.filename, 'opts.filename');
    assert.optionalBool(opts.noUnlink, 'opts.noUnlink');
    assert.optionalNumber(opts.line, 'opts.line');
    assert.optionalObject(opts.log, 'opts.log');
    assert.func(cb, 'cb');

    var tmpPath;
    if (opts.filename && opts.filename.indexOf('/') !== -1) {
        tmpPath = opts.filename;
    } else {
        tmpPath = path.resolve(
            os.tmpDir(),
            format('jirash-%s-edit-%s', process.pid, opts.filename || 'text')
        );
    }
    fs.writeFileSync(tmpPath, opts.text, 'utf8');

    var editor = process.env.EDITOR || '/usr/bin/vi';
    var cmd;
    if (opts.line) {
        cmd = format('%s +%d "%s"', editor, opts.line, tmpPath);
    } else {
        cmd = format('%s "%s"', editor, tmpPath);
    }
    var argv = argvFromLine(cmd);
    if (opts.log) {
        opts.log.trace({argv: argv}, 'editInEditor argv');
    }

    var kid = child_process.spawn(argv[0], argv.slice(1), {stdio: 'inherit'});
    kid.on('exit', function onKidExit(code, signal) {
        if (code || signal) {
            cb(
                new VError(
                    'editor terminated abnormally: argv=%j, code=%j, signal=%j',
                    argv,
                    code,
                    signal
                )
            );
            return;
        }
        var afterText = fs.readFileSync(tmpPath, 'utf8');
        if (!opts.noUnlink) {
            fs.unlinkSync(tmpPath);
        }
        cb(null, afterText, afterText !== opts.text);
    });
}

// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
// Suggested colors (some are unreadable in common cases):
// - Good: cyan, yellow (limited use), bold, green, magenta, red
// - Bad: blue (not visible on cmd.exe), grey (same color as background on
//   Solarized Dark theme from <https://github.com/altercation/solarized>, see
//   issue #160)
var colors = {
    bold: [1, 22],
    italic: [3, 23],
    underline: [4, 24],
    inverse: [7, 27],
    white: [37, 39],
    grey: [90, 39],
    black: [30, 39],
    blue: [34, 39],
    cyan: [36, 39],
    green: [32, 39],
    magenta: [35, 39],
    red: [31, 39],
    yellow: [33, 39]
};

function ansiStylize(str, color) {
    if (!str) return '';
    var codes = colors[color];
    if (codes) {
        /* eslint-disable no-octal-escape */
        return '\033[' + codes[0] + 'm' + str + '\033[' + codes[1] + 'm';
        /* eslint-enable no-octal-escape */
    } else {
        return str;
    }
}

/*
 * Style the given string with ANSI style codes *if stdout is a TTY*.
 */
function ansiStylizeTty(str, color) {
    if (!process.stdout.isTTY) {
        return str;
    } else {
        return ansiStylize(str, color);
    }
}

function indent(s, indentation) {
    if (!indentation) {
        indentation = '    ';
    }
    var lines = s.split(/\r?\n/g);
    return indentation + lines.join('\n' + indentation);
}

// http://perldoc.perl.org/functions/chomp.html
function chomp(s) {
    if (s.length) {
        while (s.slice(-1) === '\n') {
            s = s.slice(0, -1);
        }
    }
    return s;
}

/**
 * Resolve "~/..." and "~" to an absolute path.
 *
 * Limitations:
 * - This does not handle "~user/...".
 * - This depends on the HOME envvar being defined (%USERPROFILE% on Windows).
 */
function tildeSync(s) {
    var envvar = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
    var home = process.env[envvar];
    if (!home) {
        throw new Error(
            format(
                'cannot determine home dir: %s environment ' +
                    'variable is not defined',
                envvar
            )
        );
    }

    if (s === '~') {
        return home;
    } else if (
        s.slice(0, 2) === '~/' ||
        (process.platform === 'win32' && s.slice(0, 2) === '~' + path.sep)
    ) {
        return path.resolve(home, s.slice(2));
    } else {
        return s;
    }
}

// ---- exports

module.exports = {
    objCopy: objCopy,
    jsonStream: jsonStream,
    longAgo: longAgo,
    getCliTableOptions: getCliTableOptions,
    promptYesNo: promptYesNo,
    promptEnter: promptEnter,
    editInEditor: editInEditor,
    ansiStylize: ansiStylize,
    ansiStylizeTty: ansiStylizeTty,
    indent: indent,
    chomp: chomp,
    tildeSync: tildeSync
};
// vim: set softtabstop=4 shiftwidth=4:
