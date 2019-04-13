/*
 * Copyright 2019 Joyent, Inc.
 *
 * `jirash version delete ( PROJECT NAME | ID )`
 */

var format = require('util').format;

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var common = require('../../common');
var versioncommon = require('./versioncommon');

function do_delete(subcmd, opts, args, cb) {
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

                function getVerDesc(ctx, next) {
                    ctx.verDesc = ctx.ver.name;
                    if (ctx.verProject) {
                        ctx.verDesc = format(
                            '%s "%s"',
                            ctx.verProject,
                            ctx.ver.name
                        );
                    }
                    next();
                },

                function confirm(ctx, next) {
                    if (opts.f) {
                        next();
                        return;
                    }

                    common.promptYesNo({
                        msg: format('Delete version %d (%s)? [y/N] ',
                            ctx.ver.id, ctx.verDesc),
                        default: 'n'
                    }, function response(answer) {
                        if (answer === 'y') {
                            next();
                        } else if (answer === 'n') {
                            next(true);
                        } else {
                            next(new VError('cancelled'));
                        }
                    });
                },

                function deleteIt(ctx, next) {
                    ctx.cli.jirashApi.deleteVersion(
                        {
                            id: ctx.ver.id
                        },
                        function onDeleted(err) {
                            if (err) {
                                next(err);
                            } else {
                                console.log(
                                    'Deleted version %s (%s).',
                                    ctx.ver.id,
                                    ctx.verDesc
                                );
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finish(err) {
            if (err === true /* early abort signal */ || !err) {
                cb();
            } else {
                cb(err);
            }
        }
    );
}

do_delete.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['f'],
        type: 'bool',
        help: 'Force deletion without confirmation.'
    }
];

do_delete.aliases = ['rm'];

do_delete.synopses = ['{{name}} {{cmd}} [OPTIONS] ( PROJECT VERSION | ID )'];

do_delete.completionArgtypes = ['jirashproject', 'jirashversion', 'none'];

do_delete.help = [
    'Delete a project version.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Limitations: The JIRA REST API to delete a version includes',
    '`moveFixIssuesTo` and `moveAffectedIssuesTo` options that are not',
    'currently supported by this command.'
].join('\n');

module.exports = do_delete;
