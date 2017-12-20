/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash issue ...`
 */

var Cmdln = require('cmdln').Cmdln;
var util = require('util');

// ---- CLI class

function IssueCli(top) {
    this.top = top;
    Cmdln.call(this, {
        name: top.name + ' issue',
        desc: ['Search, get, and create JIRA issues.'].join('\n'),
        helpOpts: {
            minHelpCol: 24 /* line up with option help */
        },
        helpSubcmds: ['help', 'list', 'get', 'create', 'link', 'linktypes']
    });
}
util.inherits(IssueCli, Cmdln);

// Dev Note: Can't currently rely on a custom `.init` and have shortcuts work.
// See <https://github.com/trentm/node-cmdln/issues/17>

IssueCli.prototype.do_list = require('./do_list');
IssueCli.prototype.do_get = require('./do_get');
IssueCli.prototype.do_create = require('./do_create');
IssueCli.prototype.do_link = require('./do_link');
IssueCli.prototype.do_linktypes = require('./do_linktypes');

module.exports = IssueCli;
