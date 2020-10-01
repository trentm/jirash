/*
 * Copyright 2019 Joyent, Inc.
 *
 * `jirash issue comment ISSUE <file>|-`
 */

var assert = require('assert-plus');
var fs = require('fs');
var format = require('util').format;
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');

var common = require('../../common');


function textFromEditor(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.issueKey, 'opts.issueKey');
    assert.object(opts.log, 'opts.log');
    assert.func(cb, 'cb');

    var timestamp = new Date()
        .toISOString()
        .split('.')[0]
        .replace(/[:.-]/g, ''); // "YYYYMMDDTHHMMSS"
    var editFilename = format(
        './jirash-%s-%s.comment',
        timestamp,
        opts.issueKey
    );

    common.editInEditor(
        {
            text: '',
            filename: editFilename,
            noUnlink: true,
            log: opts.log
        },
        function onEdit(err, text) {
            cb(err, text);
        }
    );
}


function do_comment(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length === 1 && !opts.edit) {
        cb(new UsageError('must use "-e" or provide a FILE argument'));
        return;
    } else if (args.length > 2 || args.length < 1) {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    var top = this.top;
    var issueKey = args[0];

    vasync.pipeline(
        {
            arg: {
                cli: top
            },
            funcs: [
                function getTextFromFile(ctx, next) {
                    if (args.length !== 2) {
                        next();
                        return;
                    }

                    var file = args[1];
                    if (file === '-') {
                        file = '/dev/stdin';
                    }
                    fs.readFile(file, 'utf-8', function readTheFile(err, data) {
                        ctx.text = data;
                        next(err);
                    });
                },
                function getTextFromEditor(ctx, next) {
                    if (args.length !== 1) {
                        next();
                        return;
                    }
                    assert.ok(opts.edit, 'opts.edit');

                    textFromEditor(
                        {
                            log: top.log,
                            issueKey: issueKey
                        },
                        function onEdit(err, text) {
                            ctx.text = text;
                            next(err);
                        }
                    );
                },
                function commentIssue(ctx, next) {
                    ctx.cli.jirashApi.commentIssue(
                        {
                            issueIdOrKey: 'XXX' + issueKey,
                            issueComment: ctx.text
                        },
                        function onIssue(err, _issue) {
                            // XXX on error, print the name of file to restart with
                            //      that comment.
                            // XXX allow '-e' *and* a file arg: `jirash comment TRITON-123 -e foo.comment`
                            next(err);
                        }
                    );
                }
            ]
        },
        cb
    );
}

do_comment.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['edit', 'e'],
        type: 'bool',
        help: 'Edit the comment text in your $EDITOR.'
    }
];

do_comment.synopses = [
    '{{name}} {{cmd}} [OPTIONS] ISSUE FILE',
    '{{name}} {{cmd}} [OPTIONS] -e ISSUE'
];

do_comment.completionArgtypes = ['jirashissue', 'none'];

do_comment.help = [
    'Add a comment to an issue',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Where FILE a path from which to read comment text. Use "-" to read from',
    'stdin.',
    '',
    'Examples:',
    '    cat comment.txt | jirash issue comment TOOLS-2179 -',
    '    jirash issue comment TOOLS-2179 mycomment.md',
    '    jirash issue comment TOOLS-2179 -e    # edit in $EDITOR'
].join('\n');

module.exports = do_comment;
