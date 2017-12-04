/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash version archive ( PROJECT NAME | ID )`
 */

var assert = require('assert-plus');
var format = require('util').format;
var fs = require('fs');
var path = require('path');

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var versioncommon = require('./versioncommon');


function do_archive(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var self = this;
    var log = this.log;
    var context = {
        cli: this.top
    };
    if (args.length === 1) {
        context.verId = args[0];
    } else if (args.length === 2) {
        context.verProject = args[0];
        context.verName = args[1];
    } else {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    vasync.pipeline({arg: context, funcs: [
        versioncommon.ctxVer,

        function updateIt(ctx, next) {
            var verDesc = ctx.ver.name;
            if (ctx.verProject) {
                verDesc = format('%s "%s"', ctx.verProject, ctx.ver.name);
            }

            if (ctx.ver.archived) {
                console.log('Version %s (%s) is already archived.',
                    ctx.ver.id, verDesc);
                next();
                return;
            }

            ctx.cli.jirashApi.updateVersion({
                id: ctx.ver.id,
                data: {
                    archived: true
                }
            }, function (err) {
                if (err) {
                    next(err);
                } else {
                    console.log('Archived version %s (%s).',
                        ctx.ver.id, verDesc);
                    next();
                }
            });
        }
    ]}, cb);
}

do_archive.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_archive.synopses = ['{{name}} {{cmd}} [OPTIONS] ( PROJECT VERSION | ID )'];

do_archive.completionArgtypes = ['jirashproject', 'jirashversion', 'none'];

do_archive.help = [
    'Archive a project version.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_archive;
