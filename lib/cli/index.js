/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * The `jirash` CLI class.
 */

var assert = require('assert-plus');
var bunyan = require('bunyan');
var cmdln = require('cmdln'),
    Cmdln = cmdln.Cmdln;
var fs = require('fs');
var util = require('util');
var path = require('path');
var restifyClients = require('restify-clients');
var vasync = require('vasync');

var JirashApi = require('../jirashapi');
var libConfig = require('../config');

// ---- globals

var packageJson = require('../../package.json');

var OPTIONS = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Print this help and exit.'
    },
    {
        name: 'version',
        type: 'bool',
        help: 'Print version and exit.'
    },
    {
        names: ['verbose', 'v'],
        type: 'bool',
        help: 'Verbose/debug output.'
    }
];

// ---- other support stuff

function parseCommaSepStringNoEmpties(_option, _optstr, arg) {
    return arg
        .trim()
        .split(/\s*,\s*/g)
        .filter(function onPart(part) {
            return part;
        });
}

cmdln.dashdash.addOptionType({
    name: 'commaSepString',
    takesArg: true,
    helpArg: 'STRING',
    parseArg: parseCommaSepStringNoEmpties
});

cmdln.dashdash.addOptionType({
    name: 'arrayOfCommaSepString',
    takesArg: true,
    helpArg: 'STRING',
    parseArg: parseCommaSepStringNoEmpties,
    array: true,
    arrayFlatten: true
});

// ---- CLI class

function JirashCli() {
    Cmdln.call(this, {
        name: 'jirash',
        desc: packageJson.description,
        options: OPTIONS,
        helpOpts: {
            includeEnv: true,
            minHelpCol: 30
        },
        helpSubcmds: [
            'help',
            'completion',

            {group: 'Issues'},
            'issue',
            'issues',
            'create',
            //            'link',
            //            // 'linktypes',
            //            // 'issuetypes',
            //            // 'comment',
            //            // 'resolve',
            {group: 'Other Commands'},
            'filter',
            'version',
            'versions'
            // 'components',
            // 'priorities',
            // 'projects',
            // 'resolutions',
            // 'statuses',
            // 'user',
        ]
    });
}
util.inherits(JirashCli, Cmdln);

JirashCli.prototype.init = function init(opts, args, callback) {
    var self = this;
    this.opts = opts;

    this.log = bunyan.createLogger({
        name: this.name,
        serializers: restifyClients.bunyan.serializers,
        stream: process.stderr,
        level: 'warn'
    });
    if (opts.verbose) {
        this.log.level('trace');
        this.log.src = true;
        this.showErrStack = true;
    }

    if (opts.version) {
        console.log('jirash', packageJson.version);
        console.log(packageJson.homepage);
        callback(false);
        return;
    }

    if (process.env.JIRASH_COMPLETE) {
        /*
         * If `JIRASH_COMPLETE=<type>` is set (typically only in the
         * Triton CLI bash completion driver, see
         * "etc/jirash-bash-completion-types.sh"), then Bash completions are
         * fetched and printed, instead of the usual subcommand handling.
         *
         * Completion results are typically cached (under "~/.jirash/cache")
         * to avoid hitting the server for data everytime.
         *
         * Example usage:
         *      JIRASH_COMPLETE=projects jirash create
         */
        self._emitCompletions(process.env.JIRASH_COMPLETE, function onDone(
            err
        ) {
            callback(err || false);
        });
        return;
    }

    self.config = libConfig.loadConfig({
        configDir: self.configDir
    });

    self.jirashApi = new JirashApi({config: self.config, log: self.log});

    // Cmdln class handles `opts.help`.
    Cmdln.prototype.init.call(self, opts, args, callback);
};

JirashCli.prototype.fini = function fini(subcmd, err, cb) {
    this.log.trace({err: err, subcmd: subcmd}, 'cli fini');
    if (this.jirashApi) {
        this.jirashApi.close(cb);
    }
};

/*
 * Provide the `jirash KEY-1` shortcut for `jirash issue get KEY-1`.
 */
JirashCli.prototype.defaultHandler = function defaultHandler(
    subcmd,
    opts,
    args,
    callback
) {
    var keyRe = /^[A-Z]+-\d+$/;
    if (keyRe.test(subcmd)) {
        this.handlerFromSubcmd('issue').dispatch(
            {
                subcmd: 'get',
                opts: {short: true},
                args: [subcmd]
            },
            callback
        );
    } else {
        Cmdln.prototype.defaultHandler.call(this, subcmd, opts, args, callback);
    }
};

/*
 * Fetch and display Bash completions (one completion per line) for the given
 * Triton data type (e.g. 'images', 'instances', 'packages', ...).
 * This caches results (per profile) with a 5 minute TTL.
 *
 * Dev Note: If the cache path logic changes, then the *Bash* implementation
 * of the same logic in "etc/jirash-bash-completion-types.sh" must be updated
 * to match.
 */
JirashCli.prototype._emitCompletions = function _emitCompletions(type, cb) {
    assert.string(type, 'type');
    assert.func(cb, 'cb');

    // TODO: implement _emitCompletions

    var cacheFile = path.join(this.jirashapi.cacheDir, type + '.completions');
    var ttl = 5 * 60 * 1000; // timeout of cache file info (ms)

    vasync.pipeline(
        {
            arg: {},
            funcs: [
                function tryCacheFile(_, next) {
                    fs.stat(cacheFile, function onStat(err, stats) {
                        if (
                            !err &&
                            stats.mtime.getTime() + ttl >= new Date().getTime()
                        ) {
                            process.stdout.write(fs.readFileSync(cacheFile));
                            next(true); // early abort
                        } else if (err && err.code !== 'ENOENT') {
                            next(err);
                        } else {
                            next();
                        }
                    });
                },

                function gather(_, next) {
                    switch (type) {
                        case 'projects':
                            // ...
                            // arg.completions = completions.join('\n') + '\n';
                            // next();
                            break;
                        default:
                            process.stderr.write(
                                'warning: unknown jirash completion type: ' +
                                    type +
                                    '\n'
                            );
                            next();
                            break;
                    }
                },

                function saveCache(arg, next) {
                    if (!arg.completions) {
                        next();
                        return;
                    }
                    fs.writeFile(cacheFile, arg.completions, next);
                },

                function emit(arg, next) {
                    if (arg.completions) {
                        console.log(arg.completions);
                    }
                    next();
                }
            ]
        },
        function finish(err) {
            if (err === true) {
                // early abort signal
                err = null;
            }
            cb(err);
        }
    );
};

JirashCli.prototype.do_completion = require('./do_completion');
JirashCli.prototype.do_api = require('./do_api');

JirashCli.prototype.do_issue = require('./do_issue');
JirashCli.prototype.do_issues = require('./do_issues');
JirashCli.prototype.do_create = require('./do_create');
JirashCli.prototype.do_filter = require('./do_filter');
JirashCli.prototype.do_version = require('./do_version');
JirashCli.prototype.do_versions = require('./do_versions');

// ---- mainline

function main(argv) {
    var cli = new JirashCli();
    cmdln.main(cli, {
        argv: argv || process.argv
    });
}

// ---- exports

module.exports = {
    main: main
};
