/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash version ...`

TODO
    jirash version list PROJECT
    jirash version get ( ID | PROJECT NAME )
    jirash version archive ( ID | PROJECT NAME )
    jirash version release ( ID | PROJECT NAME )
    jirash version create ( ID | PROJECT NAME ) ...

 *
 */

var Cmdln = require('cmdln').Cmdln;
var util = require('util');


// ---- CLI class

function VersionCli(top) {
    this.top = top;
    Cmdln.call(this, {
        name: top.name + ' issue',
        desc: [
            'List and manage JIRA project versions.'
        ].join('\n'),
        helpOpts: {
            minHelpCol: 24 /* line up with option help */
        },
        helpSubcmds: [
            'help',
            'list',
            'get',
            //'archive',
            //'release',
            //'create'
        ]
    });
}
util.inherits(VersionCli, Cmdln);

VersionCli.prototype.init = function init(opts, args, cb) {
    this.log = this.top.log;
    Cmdln.prototype.init.apply(this, arguments);
};

VersionCli.prototype.do_list = require('./do_list');
VersionCli.prototype.do_get = require('./do_get');
//VersionCli.prototype.do_create = require('./do_create');


module.exports = VersionCli;
