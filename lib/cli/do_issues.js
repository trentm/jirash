/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash issues ...` shortcut for `jirash issue list ...`.
 */

var targ = require('./do_issue/do_list');

function do_issues(_subcmd, opts, args, callback) {
    this.handlerFromSubcmd('issue').dispatch(
        {
            subcmd: 'list',
            opts: opts,
            args: args
        },
        callback
    );
}

do_issues.help = 'A shortcut for "jirash issue list FILTER".\n' + targ.help;
do_issues.synopses = targ.synopses;
do_issues.options = targ.options;
do_issues.completionArgtypes = targ.completionArgtypes;

module.exports = do_issues;
