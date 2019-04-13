/*
 * Copyright (c) 2019, Joyent, Inc.
 *
 * `jirash issue comment ISSUE <file>|-`
 */

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var fs = require('fs');

function do_comment(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 2) {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    var context = {
        cli: this.top
    };

    var key = args[0];
    var commentFile = args[1];

    if (commentFile === '-') {
        commentFile = '/dev/stdin';
    }

    fs.readFile(commentFile, 'utf-8', function addComment(err, data) {
        if (err) {
            cb(new Error('unable to read file: ' + err));
            return;
        }
        vasync.pipeline(
            {
                arg: context,
                funcs: [
                    function commentIssue(ctx, next) {
                        ctx.cli.jirashApi.commentIssue(
                            {
                                issueIdOrKey: key,
                                issueComment: data
                            },
                            function onIssue(ierr, issue) {
                                ctx.issue = issue;
                                next(ierr);
                            }
                        );
                    }
                ]
            },
            cb
        );
    });
}

do_comment.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_comment.synopses = ['{{name}} {{cmd}} [OPTIONS] ISSUE FILE'];

do_comment.completionArgtypes = ['jirashissue', 'none'];

do_comment.help = [
    'Add a comment to an issue',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Reads a file or stdin and adds that text to the issue',
    '',
    'Examples:',
    '    cat comment.txt | jirash issue comment TOOLS-2179 -',
    '    jirash issue comment TOOLS-2179 mycomment.md'
].join('\n');

module.exports = do_comment;
