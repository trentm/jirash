/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash issue linktypes
 */

var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');

var common = require('../../common');

var columnsDefault = ['id', 'name', 'outward'];
var sortDefault = ['name'];

function do_linktypes(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length) {
        cb(new UsageError('too many args'));
        return;
    }

    var log = this.top.log;
    var context = {
        cli: this.top,
        log: log
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                function getLinkTypes(ctx, next) {
                    ctx.cli.jirashApi.getIssueLinkTypes(function onTypes(
                        err,
                        types
                    ) {
                        ctx.linkTypes = types;
                        ctx.log.info({linkTypes: types}, 'issue link types');
                        next(err);
                    });
                },

                function printEm(ctx, next) {
                    if (opts.json) {
                        common.jsonStream(ctx.linkTypes);
                    } else {
                        tabula(ctx.linkTypes, {
                            skipHeader: opts.H,
                            columns: opts.o,
                            sort: opts.s
                        });
                    }
                    next();
                }
            ]
        },
        cb
    );
}

do_linktypes.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
].concat(
    common.getCliTableOptions({
        includeLong: true,
        sortDefault: sortDefault,
        columnsDefault: columnsDefault
    })
);

do_linktypes.synopses = ['{{name}} {{cmd}} [OPTIONS]'];

do_linktypes.completionArgtypes = ['none'];

do_linktypes.help = [
    'List the available link types.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_linktypes;
