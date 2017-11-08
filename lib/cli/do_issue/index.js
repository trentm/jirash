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
        desc: [
            'Search, get, and create JIRA issues.'
        ].join('\n'),
        helpOpts: {
            minHelpCol: 24 /* line up with option help */
        },
        helpSubcmds: [
            'help',
            'list',
            'get',
            //'create',
        ]
    });
}
util.inherits(IssueCli, Cmdln);

IssueCli.prototype.init = function init(opts, args, cb) {
    this.log = this.top.log;
    Cmdln.prototype.init.apply(this, arguments);
};

IssueCli.prototype.do_list = require('./do_list');
IssueCli.prototype.do_get = require('./do_get');
//IssueCli.prototype.do_create = require('./do_create');


module.exports = IssueCli;
