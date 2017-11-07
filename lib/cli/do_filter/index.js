/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash filter ...`
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/filter
 */

var Cmdln = require('cmdln').Cmdln;
var util = require('util');


// ---- CLI class

function FilterCli(top) {
    this.top = top;
    Cmdln.call(this, {
        name: top.name + ' filter',
        desc: [
            'List and manage JIRA filters.',
            'JIRA filters are saved issue searches.',
        ].join('\n'),
        helpOpts: {
            minHelpCol: 24 /* line up with option help */
        },
        helpSubcmds: [
            'help',
            'list'
        ]
    });
}
util.inherits(FilterCli, Cmdln);

FilterCli.prototype.init = function init(opts, args, cb) {
    this.log = this.top.log;
    Cmdln.prototype.init.apply(this, arguments);
};

FilterCli.prototype.do_list = require('./do_list');


module.exports = FilterCli;
