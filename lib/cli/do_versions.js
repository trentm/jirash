/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash versions ...`
 */

var targ = require('./do_version/do_list');

function do_versions(subcmd, opts, args, callback) {
    this.handlerFromSubcmd('version').dispatch({
        subcmd: 'list',
        opts: opts,
        args: args
    }, callback);
}

do_versions.help = 'A shortcut for "jirash version list PROJECT".\n' + targ.help;
do_versions.synopses = targ.synopses;
do_versions.options = targ.options;
do_versions.completionArgtypes = targ.completionArgtypes;

module.exports = do_versions;
