/*
 * Copyright 2019 Joyent, Inc.
 *
 * `jirash comment ...` shortcut for `jirash issue comment ...`.
 */

var targ = require('./do_issue/do_comment');

function do_comment(_subcmd, opts, args, callback) {
    this.handlerFromSubcmd('issue').dispatch(
        {
            subcmd: 'comment',
            opts: opts,
            args: args
        },
        callback
    );
}

do_comment.help = 'A shortcut for "jirash issue comment ...".\n' + targ.help;
do_comment.synopses = targ.synopses;
do_comment.options = targ.options;
do_comment.completionArgtypes = targ.completionArgtypes;

module.exports = do_comment;
