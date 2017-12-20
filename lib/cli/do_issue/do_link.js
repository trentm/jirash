/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash issue link [OPTIONS] LINK RELATION LINK`
 *
 * Feature ideas:
 * - Could support a comment passed to the "Link issues" API call.
 */

var format = require('util').format;

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var ISSUE_KEY_RE = /^[A-Z]+-\d+$/;

function do_link(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length < 3) {
        cb(new UsageError('too few args'));
        return;
    }

    var log = this.top.log;
    var context = {
        cli: this.top,
        log: log
    };

    var inwardIssueKey = args[0];
    var outwardIssueKey = args[args.length - 1];
    var relation = args.slice(1, -1).join(' ');

    if (!ISSUE_KEY_RE.test(inwardIssueKey)) {
        cb(new UsageError(format('"%s" is not an issue key', inwardIssueKey)));
        return;
    }
    if (!ISSUE_KEY_RE.test(outwardIssueKey)) {
        cb(new UsageError(format('"%s" is not an issue key', outwardIssueKey)));
        return;
    }

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                /*
                 * TODO: cache these types, then if no match, we re-fetch them
                 * in case.
                 */
                function getLinkTypes(ctx, next) {
                    ctx.cli.jirashApi.getIssueLinkTypes(function onTypes(
                        err,
                        types
                    ) {
                        ctx.linkTypes = types;
                        ctx.log.info({linkTypes: types}, 'issue link types');
                        next(err);
                    });
                },

                function matchLinkType(ctx, next) {
                    var i;
                    var outward;
                    var relLower = relation.toLowerCase();

                    for (i = 0; i < ctx.linkTypes.length; i++) {
                        outward = ctx.linkTypes[i].outward.toLowerCase();
                        if (outward.indexOf(relLower) !== -1) {
                            ctx.linkType = ctx.linkTypes[i];
                            break;
                        }
                    }

                    if (!ctx.linkType) {
                        next(
                            new VError(
                                '"%s" does not match any link type ' +
                                    '"outward" relations (see "jirash issue ' +
                                    'linktypes")',
                                relation
                            )
                        );
                    } else {
                        next();
                    }
                },

                function linkIt(ctx, next) {
                    log.trace(
                        {
                            linkType: ctx.linkType,
                            inwardIssueKey: inwardIssueKey,
                            outwardIssueKey: outwardIssueKey
                        },
                        'create issue link'
                    );

                    // XXX
                    // jirash -v issue link TOOLS-1958 relates to TOOLS-1959
                    ctx.cli.jirashApi.linkIssues(
                        {
                            type: {
                                name: ctx.linkType.name
                            },
                            inwardIssue: {
                                key: inwardIssueKey
                            },
                            outwardIssue: {
                                key: outwardIssueKey
                            }
                        },
                        function onLink(err) {
                            next(err);
                        }
                    );
                },

                function printIt(ctx, next) {
                    console.log(
                        'Linked issues: %s %s %s.',
                        inwardIssueKey,
                        ctx.linkType.outward,
                        outwardIssueKey
                    );
                    next();
                }
            ]
        },
        function finish(err) {
            cb(err);
        }
    );
}

do_link.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_link.synopses = ['{{name}} {{cmd}} [OPTIONS] ISSUE RELATION ISSUE'];

do_link.completionArgtypes = [
    'jirashissue',
    'jirashlinkrelation',
    'jirashissue',
    'none'
];

do_link.help = [
    'Link an issue to another.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Examples:',
    '    jirash issue link TRITON-2 is caused by TRITON-1'
    // XXX More examples
].join('\n');

module.exports = do_link;
