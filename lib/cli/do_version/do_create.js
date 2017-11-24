/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash version create PROJECT VERSION-NAME`
 */

var assert = require('assert-plus');
var format = require('util').format;
var fs = require('fs');
var path = require('path');

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('VError');


function do_create(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 2) {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    var self = this;
    var log = this.log;

    var project = args[0];
    var name = args[1];
    var releaseDate;
    var releaseDateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (opts.release_date) {
        if (!releaseDateRe.test(opts.release_date)) {
            cb(new UsageError('release date does not match YYYY-MM-DD: '
                + opts.release_date));
            return;
        }
        releaseDate = opts.release_date;
    }

    var createOpts = {
        project: project,
        name: name
    };
    if (opts.description) {
        createOpts.description = opts.description;
    }
    if (opts.released) {
        createOpts.released = opts.released;
    }
    if (opts.archived) {
        createOpts.archived = opts.archived;
    }
    if (releaseDate) {
        createOpts.releaseDate = releaseDate;
    }

    this.top.jirashApi.createVersion(createOpts, function (err, ver) {
        if (err) {
            cb(err);
        } else {
            var extras = [];
            if (ver.releaseDate) {
                extras.push('releaseDate=' + ver.releaseDate);
            }
            if (ver.released) {
                extras.push('released');
            }
            if (ver.archived) {
                extras.push('archived');
            }
            console.log('Created version %s "%s"%s', project, ver.name,
                (extras.length ? ' (' + extras.join(', ') + ')' : ''));
            cb();
        }
    });
}

do_create.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['release-date', 'r'],
        type: 'string',
        helpArg: 'YYYY-MM-DD'
    },
    {
        names: ['description', 'D'],
        type: 'string',
        helpArg: 'DESC'
    },
    {
        names: ['released'],
        type: 'bool',
        help: 'Mark the new version as released.'

    },
    {
        names: ['archived'],
        type: 'bool',
        help: 'Mark the new version as archived.'
    }
];

do_create.synopses = ['{{name}} {{cmd}} [OPTIONS] PROJECT VERSION-NAME'];

do_create.completionArgtypes = ['jirashproject'];

do_create.help = [
    'Create a project version.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_create;
