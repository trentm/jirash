/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash issue get ...`
 */

var format = require('util').format;
var fs = require('fs');
var path = require('path');

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');


function do_get(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 1) {
        return cb(new UsageError('incorrect number of args'));
    }

    var self = this;
    var log = this.top.log;
    var key = args[0];

    vasync.pipeline({arg: {cli: this.top}, funcs: [
        function getIssue(ctx, next) {
            var fields;
            if (opts.short) {
                fields = ['summary'];
            } else if (opts.json) {
                fields = opts.fields;
            } else {
                fields = ['summary', 'reporter', 'assignee', 'priority',
                    'issuetype', 'status'];
            }

            ctx.cli.jirashApi.getIssue({
                issueIdOrKey: key,
                fields: fields
            }, function (err, issue) {
                ctx.issue = issue;
                next(err);
            });
        },

        function printIssue(ctx, next) {
            if (opts.json) {
                console.log(JSON.stringify(ctx.issue, null, 4));
            } else if (opts.short) {
                console.log('%s %s', ctx.issue.key, ctx.issue.fields.summary);
            } else {
                var fields = ctx.issue.fields;
                var extra = [];
                extra.push(format('%s -> %s', fields.reporter.name,
                    fields.assignee && fields.assignee.name || '<unassigned>'));
                if (fields.issuetype && fields.issuetype.name) {
                    extra.push(fields.issuetype.name);
                }
                if (fields.priority && fields.priority.name) {
                    extra.push(fields.priority.name);
                } else {
                    extra.push('<no prio>');
                }
                extra.push(fields.status.name);
                console.log('%s %s (%s)', ctx.issue.key, fields.summary,
                    extra.join(', '));
            }
            next();
        }
    ]}, cb);
}

do_get.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['short', 's'],
        type: 'bool',
        help: 'Short issue representation.'
    },
    {
        names: ['fields'],
        type: 'arrayOfCommaSepString',
        helpArg: 'FIELD,...',
        help: 'Limit response to the given fields. By default all fields are '
            + 'returned. This is ignored unless `--json` option is also given.'
    },
    {
        names: ['json', 'j'],
        type: 'bool',
        help: 'Raw JSON output.'
    }
];

do_get.synopses = ['{{name}} {{cmd}} [OPTIONS] ISSUE'];

do_get.completionArgtypes = ['jirashissue', 'none'];

do_get.help = [
    'Get an issue.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_get;
