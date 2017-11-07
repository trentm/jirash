/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var assert = require('assert-plus');
var format = require('util').format;
var path = require('path');


// ---- support stuff

function objCopy(obj, target) {
    assert.object(obj, 'obj');
    assert.optionalObject(obj, 'target');

    if (target === undefined) {
        target = {};
    }
    Object.keys(obj).forEach(function (k) {
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

    arr.forEach(function (elem) {
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
        if (time > 0)
            return util.format('%d%s', time, names[i]);
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
            if (0 <= code && code <= 31) {
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
    read({
        prompt: prompt
    }, function (err, result, isDefault) {
        cb(err);
    });
}


/*
 * Prompt the user for a value.
 *
 * @params field {Object}
 *      - field.desc {String} Optional. A description of the field to print
 *        before prompting.
 *      - field.key {String} The field name. Used as the prompt.
 *      - field.default  Optional default value.
 *      - field.validate {Function} Optional. A validation/manipulation
 *        function of the form:
 *              function (value, cb)
 *        which should callback with
 *              cb([<error or null>, [<manipulated value>]])
 *        examples:
 *              cb(new Error('value is not a number'));
 *              cb();   // value is fine as is
 *              cb(null, Math.floor(Number(value))); // manip to a floored int
 *      - field.required {Boolean} Optional. If `field.validate` is not
 *        given, `required=true` will provide a validate func that requires
 *        a value.
 * @params cb {Function} `function (err, value)`
 *      If the user aborted, the `err` will be whatever the [read
 *      package](https://www.npmjs.com/package/read) returns, i.e. a
 *      string "cancelled".
 */
function promptField(field, cb) {
    var wrap = wordwrap(Math.min(process.stdout.columns, 80));

    var validate = field.validate;
    if (!validate && field.required) {
        validate = function (value, validateCb) {
            if (!value) {
                validateCb(new Error(format('A value for "%s" is required.',
                    field.key)));
            } else {
                validateCb();
            }
        };
    }

    function attempt(next) {
        read({
            // read/readline prompting messes up width with ANSI codes here.
            prompt: field.key + ':',
            default: field.default,
            silent: field.password,
            edit: true
        }, function (err, result, isDefault) {
            if (err) {
                return cb(err);
            }
            var value = result.trim();
            if (!validate) {
                return cb(null, value);
            }

            validate(value, function (validationErr, newValue) {
                if (validationErr) {
                    console.log(ansiStylize(
                        wrap(validationErr.message), 'red'));
                    attempt();
                } else {
                    if (newValue !== undefined) {
                        value = newValue;
                    }
                    cb(null, value);
                }
            });
        });
    }

    if (field.desc) {
        // Wrap, if no newlines.
        var wrapped = field.desc;
        if (field.desc.indexOf('\n') === -1) {
            wrapped = wrap(field.desc);
        }

        // Bold up to the first period, or all of it, if no period.
        var periodIdx = wrapped.indexOf('.');
        if (periodIdx !== -1) {
            console.log(
                ansiStylize(wrapped.slice(0, periodIdx + 1), 'bold') +
                wrapped.slice(periodIdx + 1));
        } else {
            console.log(ansiStylize(wrap(field.desc), 'bold'));
        }
    }
    attempt();
}


/*
 * A utility for the `jirash` CLI subcommands to `init()`ialize a
 * `jirashApi` instance and ensure that config is loaded, etc.
 * This is typically the CLI's `jirashApi` instance.
 *
 * @param opts.cli {Object}
 * @param opts.jirashApi {Object}
 * @param cb {Function} `function (err)`
 */
function cliSetupJirashApi(opts, cb) {
    assert.optionalObject(opts.cli, 'opts.cli');
    assert.optionalObject(opts.jirashApi, 'opts.jirashApi');
    // XXX avoid this hack if we can?
    XXX
    var tritonapi = opts.tritonapi || opts.cli.tritonapi;
    assert.object(tritonapi, 'tritonapi');

    tritonapi.init(function (initErr) {
        if (initErr) {
            cb(initErr);
            return;
        }

        promptPassphraseUnlockKey({
            tritonapi: tritonapi
        }, function (keyErr) {
            cb(keyErr);
        });
    });
}


/**
 * Edit the given text in $EDITOR (defaulting to `vi`) and return the edited
 * text.
 *
 * This callback with `cb(err, updatedText, changed)` where `changed`
 * is a boolean true if the text was changed.
 */
function editInEditor(opts, cb) {
    assert.string(opts.text, 'opts.text');
    assert.optionalString(opts.filename, 'opts.filename');
    assert.optionalObject(opts.log, 'opts.log');
    assert.func(cb, 'cb');

    var tmpPath = path.resolve(os.tmpDir(),
        format('triton-%s-edit-%s', process.pid, opts.filename || 'text'));
    fs.writeFileSync(tmpPath, opts.text, 'utf8');

    var editor = process.env.EDITOR || '/usr/bin/vi';
    var argv = argvFromLine(format('%s "%s"', editor, tmpPath));
    if (opts.log) {
        opts.log.trace({argv: argv}, 'editInEditor argv');
    }

    var kid = child_process.spawn(argv[0], argv.slice(1), {stdio: 'inherit'});
    kid.on('exit', function (code, signal) {
        if (code || signal) {
            cb(new errors.TritonError(format(
                'editor terminated abnormally: argv=%j, code=%j, signal=%j',
                argv, code, signal)));
            return;
        }
        var afterText = fs.readFileSync(tmpPath, 'utf8');
        fs.unlinkSync(tmpPath);
        cb(null, afterText, (afterText !== opts.text));
    });
}


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
// Suggested colors (some are unreadable in common cases):
// - Good: cyan, yellow (limited use), bold, green, magenta, red
// - Bad: blue (not visible on cmd.exe), grey (same color as background on
//   Solarized Dark theme from <https://github.com/altercation/solarized>, see
//   issue #160)
var colors = {
    'bold' : [1, 22],
    'italic' : [3, 23],
    'underline' : [4, 24],
    'inverse' : [7, 27],
    'white' : [37, 39],
    'grey' : [90, 39],
    'black' : [30, 39],
    'blue' : [34, 39],
    'cyan' : [36, 39],
    'green' : [32, 39],
    'magenta' : [35, 39],
    'red' : [31, 39],
    'yellow' : [33, 39]
};

function ansiStylize(str, color) {
    if (!str)
        return '';
    var codes = colors[color];
    if (codes) {
        return '\033[' + codes[0] + 'm' + str +
                     '\033[' + codes[1] + 'm';
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
    var envvar = (process.platform === 'win32' ? 'USERPROFILE' : 'HOME');
    var home = process.env[envvar];
    if (!home) {
        throw new Error(format('cannot determine home dir: %s environment ' +
            'variable is not defined', envvar));
    }

    if (s === '~') {
        return home;
    } else if (s.slice(0, 2) === '~/' ||
        (process.platform === 'win32' && s.slice(0, 2) === '~'+path.sep))
    {
        return path.resolve(home, s.slice(2));
    } else {
        return s;
    }
}


/**
 * Transform an array of 'key=value' CLI arguments to an object.
 *
 * - The use of '.' in the key allows sub-object assignment (only one level
 *   deep). This can be disabled with `opts.disableDotted`.
 * - An attempt will be made the `JSON.parse` a given value, such that
 *   booleans, numbers, objects, arrays can be specified; at the expense
 *   of not being able to specify, e.g., a literal 'true' string.
 *   If `opts.typeHintFromKey` states that a key is a string, this JSON.parse
 *   is NOT done.
 * - An empty 'value' is transformed to `null`. Note that 'null' also
 *   JSON.parse's as `null`.
 *
 * Example:
 *  > objFromKeyValueArgs(['nm=foo', 'tag.blah=true', 'empty=', 'nada=null']);
 *  { nm: 'foo',
 *    tag: { blah: true },
 *    empty: null,
 *    nada: null }
 *
 * @param args {Array} Array of string args to process.
 * @param opts {Object} Optional.
 *      - @param disableDotted {Boolean} Optional. Set to true to disable
 *        dotted keys.
 *      - @param typeHintFromKey {Object} Optional. Type hints for input keys.
 *        E.g. if parsing 'foo=false' and `typeHintFromKey={foo: 'string'}`,
 *        then we do NOT parse it to a boolean `false`.
 *      - @param {Array} validKeys: Optional array of strings or regexes
 *        matching valid keys. By default all keys are valid.
 *      - @param failOnEmptyValue {Boolean} Optional. If true, then a key with a
 *        value that is the empty string throws an error. Default is false.
 */
function objFromKeyValueArgs(args, opts)
{
    assert.arrayOfString(args, 'args');
    assert.optionalObject(opts, 'opts');
    opts = opts || {};
    assert.optionalBool(opts.disableDotted, 'opts.disableDotted');
    assert.optionalBool(opts.disableTypeConversions,
        'opts.disableTypeConversions');
    assert.optionalObject(opts.typeHintFromKey, opts.typeHintFromKey);
    assert.optionalBool(opts.failOnEmptyValue, 'opts.failOnEmptyValue');

    var obj = {};
    args.forEach(function (arg) {
        var parsedKeyValue = _parseKeyValue(arg, opts.validKeys, {
            typeHintFromKey: opts.typeHintFromKey,
            disableTypeConversions: opts.disableTypeConversions,
            failOnEmptyValue: opts.failOnEmptyValue
        });

        if (opts.disableDotted) {
            obj[parsedKeyValue.key] = parsedKeyValue.value;
        } else {
            var dotted = strsplit(parsedKeyValue.key, '.', 2);
            if (dotted.length > 1) {
                if (!obj[dotted[0]]) {
                    obj[dotted[0]] = {};
                }
                obj[dotted[0]][dotted[1]] = parsedKeyValue.value;
            } else {
                obj[parsedKeyValue.key] = parsedKeyValue.value;
            }
        }
    });

    return obj;
}



//---- exports

module.exports = {
    objCopy: objCopy,
    jsonStream: jsonStream,
    longAgo: longAgo,
    getCliTableOptions: getCliTableOptions,
    promptYesNo: promptYesNo,
    promptEnter: promptEnter,
    promptField: promptField,
    cliSetupJirashApi: cliSetupJirashApi,
    editInEditor: editInEditor,
    ansiStylize: ansiStylize,
    ansiStylizeTty: ansiStylizeTty,
    indent: indent,
    chomp: chomp,
    tildeSync: tildeSync,
    objFromKeyValueArgs: objFromKeyValueArgs,
};
// vim: set softtabstop=4 shiftwidth=4:
