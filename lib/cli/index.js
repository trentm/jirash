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
var util = require('util'),
    format = util.format;
var path = require('path');
var restifyClients = require('restify-clients');
var vasync = require('vasync');
var VError = require('verror');

var JirashApi = require('../jirashapi');
var libConfig = require('../config');


//---- globals

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

function parseCommaSepStringNoEmpties(option, optstr, arg) {
    return arg.trim().split(/\s*,\s*/g)
        .filter(function (part) { return part; });
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


//---- CLI class

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

            { group: 'Issues' },
            'issue',
//            'issues',
//            'create',  // createissue
//            'link',
//            // 'linktypes',
//            // 'issuetypes',
//            // 'comment',
//            // 'resolve',
            { group: 'Other Commands' },
//            'filters',
            'versions',
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

JirashCli.prototype.init = function (opts, args, callback) {
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
         *      JIRASH_COMPLETE=projects triton create
         */
        XXX
        self._emitCompletions(process.env.JIRASH_COMPLETE, function (err) {
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
    this.jirashApi.close(cb);
};


/*
 * Provide the `jirash KEY-1` shortcut for `jirash issue get KEY-1`.
 */
JirashCli.prototype.defaultHandler = function defaultHandler(
        subcmd, opts, args, callback) {
    var keyRe = /^[A-Z]+-\d+$/;
    if (keyRe.test(subcmd)) {
        this.handlerFromSubcmd('issue').dispatch({
            subcmd: 'get',
            opts: {'short': true},
            args: [subcmd]
        }, callback);
    } else {
        Cmdln.prototype.defaultHandler.call(this, subcmd, opts, args, callback);
    }
};

// XXX
///*
// * Fetch and display Bash completions (one completion per line) for the given
// * Triton data type (e.g. 'images', 'instances', 'packages', ...).
// * This caches results (per profile) with a 5 minute TTL.
// *
// * Dev Note: If the cache path logic changes, then the *Bash* implementation
// * of the same logic in "etc/triton-bash-completion-types.sh" must be updated
// * to match.
// */
//JirashCli.prototype._emitCompletions = function _emitCompletions(type, cb) {
//    assert.string(type, 'type');
//    assert.func(cb, 'cb');
//
//    var cacheFile = path.join(this.tritonapi.cacheDir, type + '.completions');
//    var ttl = 5 * 60 * 1000; // timeout of cache file info (ms)
//    var tritonapi = this.tritonapi;
//
//    vasync.pipeline({arg: {}, funcs: [
//        function tryCacheFile(arg, next) {
//            fs.stat(cacheFile, function (err, stats) {
//                if (!err &&
//                    stats.mtime.getTime() + ttl >= (new Date()).getTime()) {
//                    process.stdout.write(fs.readFileSync(cacheFile));
//                    next(true); // early abort
//                } else if (err && err.code !== 'ENOENT') {
//                    next(err);
//                } else {
//                    next();
//                }
//            });
//        },
//        function initAuth(args, next) {
//            tritonapi.init(function (initErr) {
//                if (initErr) {
//                    next(initErr);
//                }
//                if (tritonapi.keyPair.isLocked()) {
//                    next(new errors.TritonError(
//                        'cannot unlock keys during completion'));
//                }
//                next();
//            });
//        },
//
//        function gather(arg, next) {
//            var completions;
//
//            switch (type) {
//            case 'packages':
//                tritonapi.cloudapi.listPackages({}, function (err, pkgs) {
//                    if (err) {
//                        next(err);
//                        return;
//                    }
//                    completions = [];
//                    pkgs.forEach(function (pkg) {
//                        if (pkg.name.indexOf(' ') === -1) {
//                            // Cannot bash complete results with spaces, so
//                            // skip them here.
//                            completions.push(pkg.name);
//                        }
//                        completions.push(pkg.id);
//                    });
//                    arg.completions = completions.join('\n') + '\n';
//                    next();
//                });
//                break;
//            case 'images':
//                tritonapi.cloudapi.listImages({}, function (err, imgs) {
//                    if (err) {
//                        next(err);
//                        return;
//                    }
//                    completions = [];
//                    imgs.forEach(function (img) {
//                        // Cannot bash complete results with spaces, so
//                        // skip them here.
//                        if (img.name.indexOf(' ') === -1) {
//                            completions.push(img.name);
//                            if (img.version.indexOf(' ') === -1) {
//                                completions.push(img.name + '@' + img.version);
//                            }
//                        }
//                        completions.push(img.id);
//                    });
//                    arg.completions = completions.join('\n') + '\n';
//                    next();
//                });
//                break;
//            case 'instances':
//                tritonapi.cloudapi.listMachines({}, function (err, insts) {
//                    if (err) {
//                        next(err);
//                        return;
//                    }
//                    completions = [];
//                    insts.forEach(function (inst) {
//                        if (inst.name.indexOf(' ') === -1) {
//                            // Cannot bash complete results with spaces, so
//                            // skip them here.
//                            completions.push(inst.name);
//                        }
//                        completions.push(inst.id);
//                    });
//                    arg.completions = completions.join('\n') + '\n';
//                    next();
//                });
//                break;
//            case 'volumes':
//                tritonapi.cloudapi.listVolumes({}, function (err, vols) {
//                    if (err) {
//                        next(err);
//                        return;
//                    }
//                    completions = [];
//                    vols.forEach(function (vol) {
//                        completions.push(vol.name);
//                        completions.push(vol.id);
//                    });
//                    arg.completions = completions.join('\n') + '\n';
//                    next();
//                });
//                break;
//            case 'affinityrules':
//                /*
//                 * We exclude ids, in favour of just inst names here. The only
//                 * justification for differing from other completion types
//                 * on that is that with the additional prefixes, there would
//                 * be too many.
//                 */
//                tritonapi.cloudapi.listMachines({}, function (err, insts) {
//                    if (err) {
//                        next(err);
//                        return;
//                    }
//                    completions = [];
//                    insts.forEach(function (inst) {
//                        if (inst.name.indexOf(' ') === -1) {
//                            // Cannot bash complete results with spaces, so
//                            // skip them here.
//                            completions.push('inst==' + inst.name);
//                            completions.push('inst!=' + inst.name);
//                            completions.push('inst==~' + inst.name);
//                            completions.push('inst!=~' + inst.name);
//                        }
//                    });
//                    arg.completions = completions.join('\n') + '\n';
//                    next();
//                });
//                break;
//            case 'networks':
//                tritonapi.cloudapi.listNetworks({}, function (err, nets) {
//                    if (err) {
//                        next(err);
//                        return;
//                    }
//                    completions = [];
//                    nets.forEach(function (net) {
//                        if (net.name.indexOf(' ') === -1) {
//                            // Cannot bash complete results with spaces, so
//                            // skip them here.
//                            completions.push(net.name);
//                        }
//                        completions.push(net.id);
//                    });
//                    arg.completions = completions.join('\n') + '\n';
//                    next();
//                });
//                break;
//            case 'fwrules':
//                tritonapi.cloudapi.listFirewallRules({}, function (err,
//                                                                   fwrules) {
//                    if (err) {
//                        next(err);
//                        return;
//                    }
//                    completions = [];
//                    fwrules.forEach(function (fwrule) {
//                        completions.push(fwrule.id);
//                    });
//                    arg.completions = completions.join('\n') + '\n';
//                    next();
//                });
//                break;
//            case 'keys':
//                tritonapi.cloudapi.listKeys({}, function (err, keys) {
//                    if (err) {
//                        next(err);
//                        return;
//                    }
//                    completions = [];
//                    keys.forEach(function (key) {
//                        if (key.name.indexOf(' ') === -1) {
//                            // Cannot bash complete results with spaces, so
//                            // skip them here.
//                            completions.push(key.name);
//                        }
//                        completions.push(key.fingerprint);
//                    });
//                    arg.completions = completions.join('\n') + '\n';
//                    next();
//                });
//                break;
//            default:
//                process.stderr.write('warning: unknown triton completion type: '
//                    + type + '\n');
//                next();
//                break;
//            }
//        },
//
//        function saveCache(arg, next) {
//            if (!arg.completions) {
//                next();
//                return;
//            }
//            fs.writeFile(cacheFile, arg.completions, next);
//        },
//
//        function emit(arg, next) {
//            if (arg.completions) {
//                console.log(arg.completions);
//            }
//            next();
//        }
//    ]}, function (err) {
//        if (err === true) { // early abort signal
//            err = null;
//        }
//        cb(err);
//    });
//};



JirashCli.prototype.do_completion = require('./do_completion');

JirashCli.prototype.do_issue = require('./do_issue');

JirashCli.prototype.do_versions = require('./do_versions');


//---- mainline

function main(argv) {
    var cli = new JirashCli();
    cmdln.main(cli, {
        argv: argv || process.argv
    });
}


//---- exports

module.exports = {
    main: main
};
