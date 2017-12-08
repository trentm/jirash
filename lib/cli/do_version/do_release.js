/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash version release ( PROJECT NAME | ID )`
 */

var format = require('util').format;

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');

var versioncommon = require('./versioncommon');

function do_release(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

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

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                versioncommon.ctxVer,

                function updateIt(ctx, next) {
                    var verDesc = ctx.ver.name;
                    if (ctx.verProject) {
                        verDesc = format(
                            '%s "%s"',
                            ctx.verProject,
                            ctx.ver.name
                        );
                    }

                    if (ctx.ver.released) {
                        console.log(
                            'Version %s (%s) is already released.',
                            ctx.ver.id,
                            verDesc
                        );
                        next();
                        return;
                    }

                    ctx.cli.jirashApi.updateVersion(
                        {
                            id: ctx.ver.id,
                            data: {
                                released: true
                            }
                        },
                        function onUpdaten(err) {
                            if (err) {
                                next(err);
                            } else {
                                console.log(
                                    'Released version %s (%s).',
                                    ctx.ver.id,
                                    verDesc
                                );
                                next();
                            }
                        }
                    );
                }
            ]
        },
        cb
    );
}

do_release.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_release.synopses = ['{{name}} {{cmd}} [OPTIONS] ( PROJECT VERSION | ID )'];

do_release.completionArgtypes = ['jirashproject', 'jirashversion', 'none'];

do_release.help = [
    'Release a project version.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_release;
