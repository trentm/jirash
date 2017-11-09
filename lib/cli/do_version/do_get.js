/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash version get ...`
 */

var format = require('util').format;
var fs = require('fs');
var path = require('path');

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('VError');


function do_get(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length < 1) {
        return cb(new UsageError('incorrect number of args'));
    }

    var self = this;
    var log = this.log;

    vasync.pipeline({arg: {cli: this.top}, funcs: [
        function getVersionById(ctx, next) {
            // jirash version get ID
            var id = args[0];
            if (args.length !== 1 || !/^\d+$/.test(id)) {
                next();
                return;
            }

            ctx.cli.jirashApi.getVersion(id, function (err, ver) {
                ctx.ver = ver;
                next(err);
            });
        },

        function ensureTwoArgs(ctx, next) {
            if (!ctx.ver && args.length !== 2) {
                next(new UsageError('invalid args: %j', args));
            } else {
                next();
            }
        },

        function getVersionByProjAndName(ctx, next) {
            if (ctx.ver) {
                next();
                return;
            }

            // jirash version get PROJECT VERSION
            var proj = args[0];
            var name = args[1];

            ctx.cli.jirashApi.getProjectVersions(proj, function (err, vers) {
                for (var i = 0; i < vers.length; i++) {
                    if (vers[i].name === name) {
                        ctx.ver = vers[i];
                        break;
                    }
                }

                if (ctx.ver) {
                    next();
                } else {
                    next(new VError('no "%s" version on project "%s"',
                        name, proj));
                }
            });
        },

        function printVer(ctx, next) {
            console.log(JSON.stringify(ctx.ver, null, 4));
            next();
        }
    ]}, cb);
}

do_get.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_get.synopses = ['{{name}} {{cmd}} [OPTIONS] ( PROJECT VERSION | ID )'];

do_get.completionArgtypes = ['jirashproject', 'jirashversion', 'none'];

do_get.help = [
    'Get a version.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_get;
