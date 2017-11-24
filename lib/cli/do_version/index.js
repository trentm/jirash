/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash version ...`
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
            'create',
            { group: 'Update Commands' },
            'update',
            'archive',
            'release',
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
VersionCli.prototype.do_create = require('./do_create');

VersionCli.prototype.do_update = require('./do_update');
VersionCli.prototype.do_archive = require('./do_archive');
VersionCli.prototype.do_release = require('./do_release');


module.exports = VersionCli;
