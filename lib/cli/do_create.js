/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash create ...` shortcut
 */

var targ = require('./do_issue/do_create');

function do_create(_subcmd, opts, args, callback) {
    this.handlerFromSubcmd('issue').dispatch(
        {
            subcmd: 'create',
            opts: opts,
            args: args
        },
        callback
    );
}

do_create.help = 'A shortcut for "jirash issue create PROJECT".\n' + targ.help;
do_create.synopses = targ.synopses;
do_create.options = targ.options;
do_create.completionArgtypes = targ.completionArgtypes;

module.exports = do_create;
