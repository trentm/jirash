/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash version get ...`
 */

var assert = require('assert-plus');
var format = require('util').format;
var fs = require('fs');
var path = require('path');

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('VError');

var versioncommon = require('./versioncommon');


function do_get(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var self = this;
    var log = this.log;
    var context = {
        cli: this.top
    };
    if (args.length === 1) {
        context.verId = args[0];
    } else if (args.length === 2) {
        context.verProject = args[0];
        context.verName = args[1];
    } else {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    vasync.pipeline({arg: context, funcs: [
        versioncommon.ctxVer,

        function printVer(ctx, next) {
            console.log(JSON.stringify(ctx.ver, null, 4));
            next();
        }
    ]}, cb);
}

do_get.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_get.synopses = ['{{name}} {{cmd}} [OPTIONS] ( PROJECT VERSION | ID )'];

do_get.completionArgtypes = ['jirashproject', 'jirashversion', 'none'];

do_get.help = [
    'Get a version.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_get;
