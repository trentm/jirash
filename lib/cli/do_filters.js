/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jirash filters` shortcut for `jirash filter list`
 */

var targ = require('./do_filter/do_list');

function do_filters(_subcmd, opts, args, callback) {
    this.handlerFromSubcmd('filter').dispatch(
        {
            subcmd: 'list',
            opts: opts,
            args: args
        },
        callback
    );
}

do_filters.help = 'A shortcut for "jirash filter list PROJECT".\n' + targ.help;
do_filters.synopses = targ.synopses;
do_filters.options = targ.options;
do_filters.completionArgtypes = targ.completionArgtypes;

module.exports = do_filters;
