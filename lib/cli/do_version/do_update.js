/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash version update ( PROJECT NAME | ID ) FIELD=VALUE ...`
 */

var assert = require('assert-plus');
var format = require('util').format;
var fs = require('fs');
var path = require('path');

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var versioncommon = require('./versioncommon');


var UPDATEABLE_FIELDS = [
    {
        name: 'released',
        type: 'bool'
    },
    {
        name: 'archived',
        type: 'bool'
    },
    {
        name: 'releaseDate',
        type: 'string',
        regex: /^\d{4}-\d{2}-\d{2}$/
    }
];

function do_update(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    var self = this;
    var log = this.log;
    var context = {
        cli: this.top
    };
    var fieldValues;
    if (args.length < 1) {
        cb(new UsageError('incorrect number of args'));
        return;
    } else if (/^\d+$/.test(args[0])) {
        context.verId = args[0];
        fieldValues = args.slice(1);
    } else {
        context.verProject = args[0];
        context.verName = args[1];
        fieldValues = args.slice(2);
    }

    // Parse the given FIELD=VALUE args into an object of updates.
    var updates = {};
    try {
        fieldValues.forEach(function (kv) {
            var i;
            var idx = kv.indexOf('=');
            if (idx === -1) {
                throw new UsageError(
                    format('invalid key=value: "%s"', kv));
            }
            var k = kv.slice(0, idx);
            var v = kv.slice(idx + 1);

            var spec;
            var foundMatch = false;
            for (i = 0; i < UPDATEABLE_FIELDS.length; i++) {
                spec = UPDATEABLE_FIELDS[i];
                if (spec.name === k) {
                    foundMatch = true;
                    switch (spec.type) {
                    case 'bool':
                        if (v === 'true') {
                            updates[k] = true;
                        } else if (v === 'false') {
                            updates[k] = false;
                        } else {
                            throw new UsageError(format(
                                'invalid value for "%s", '
                                + 'must be "true" or "false"',
                                k
                            ));
                        }
                        break;
                    case 'string':
                        if (spec.regex && !spec.regex.test(v)) {
                            throw new UsageError(format(
                                'invalid value for "%s", does not match %s: %s',
                                k, spec.regex, v
                            ));
                        }
                        updates[k] = v;
                        break;
                    default:
                        throw new Error('unknown field type: ' + spec.type);
                    }
                }
            }
            if (!foundMatch) {
                throw new UsageError(format(
                    'invalid field: "%s" (must match one of: %s)',
                    k,
                    UPDATEABLE_FIELDS.map(
                        function (f) { return f.name; }
                    ).join(', ')
                ));
            }
        });
    } catch (fieldValuesErr) {
        cb(fieldValuesErr);
        return;
    }

    if (Object.keys(updates).length === 0) {
        cb();
        return;
    }

    vasync.pipeline({arg: context, funcs: [
        versioncommon.ctxVer,

        function updateIt(ctx, next) {
            var verDesc = ctx.ver.name;
            if (ctx.verProject) {
                verDesc = format('%s "%s"', ctx.verProject, ctx.ver.name);
            }

            ctx.cli.jirashApi.updateVersion({
                id: ctx.ver.id,
                data: updates
            }, function (err) {
                if (err) {
                    next(err);
                } else {
                    console.log('Updated version %s (%s).',
                        ctx.ver.id, verDesc);
                    next();
                }
            });
        }
    ]}, cb);
}

do_update.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
];

do_update.synopses = [
    '{{name}} {{cmd}} [OPTIONS] ( PROJECT VERSION | ID ) FIELD=VALUE ...'];

do_update.completionArgtypes = ['jirashproject', 'jirashversion', 'none'];

do_update.help = [
    'Update attributes of a project version.',
    '',
    '{{usage}}',
    '',
    '{{options}}',

    'Updateable fields:',
    '    ' + UPDATEABLE_FIELDS.map(
        function (f) { return format('%s (%s)', f.name, f.type); }
    ).join('\n    '),

    '',
    'Examples:',
    '    jirash version update PORTAL 1.2.3 releaseDate=2018-01-01',
    '    jirash version update PORTAL 1.2.3 archived=false'
].join('\n');

module.exports = do_update;
