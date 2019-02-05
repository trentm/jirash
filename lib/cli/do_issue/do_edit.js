/*
 * Copyright (c) 2019, Joyent, Inc.
 *
 * `jirash issue edit ISSUE EDIT-JSON`
 */

var format = require('util').format;

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');

function do_edit(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 2) {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    var key = args[0];
    var issueData;
    try {
        issueData = {"update": JSON.parse(args[1])};
    } catch (parseErr) {
        cb(new UsageError('could not parse EDIT-JSON: ' + parseErr.message));
        return;
    }

    vasync.pipeline(
        {
            arg: {cli: this.top},
            funcs: [
                function editIssue(ctx, next) {
                    ctx.cli.jirashApi.editIssue(
                        {
                            issueIdOrKey: key,
                            issueData: issueData
                        },
                        function onIssue(err, issue) {
                            ctx.issue = issue;
                            next(err);
                        }
                    );
                }
            ]
        },
        cb
    );
}

do_edit.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_edit.synopses = ['{{name}} {{cmd}} [OPTIONS] ISSUE EDIT-JSON'];

do_edit.completionArgtypes = ['jirashissue', 'none'];

do_edit.help = [
    'Modify an issue using issue-edit operations',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'This is currently a raw interface to the "Edit issue" Jira REST API.',
    'See https://docs.atlassian.com/software/jira/docs/api/REST/7.4.2/#api/2/issue-editIssue',
    'for details on the format of EDIT-JSON.',
    '',
    'Examples:',
    '- Add a label:',
    '    jirash issue edit TOOLS-2179 \'{"labels": [{"add": "teapot"}]}\'',
    '- Remove a label:',
    '    jirash issue edit TOOLS-2179 \'{"labels": [{"remove": "spout"}]}\'',
    '- Set the summary:',
    '    jirash issue edit TOOLS-2179 \'{"summary": [{"set": "This is my handle"}]}\''
].join('\n');

module.exports = do_edit;
