/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash filter list ...`
 */

var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');

var common = require('../../common');

var columnsDefault = 'id,name,owner.name,sharedWith'.split(/,/g);
var columnsDefaultLong = 'id,name,owner.name,viewUrl,jql'.split(/,/g);
var sortDefault = 'name'.split(/,/g);

function do_list(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 0) {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    var columns = columnsDefault;
    if (opts.o) {
        columns = opts.o;
    } else if (opts.long) {
        columns = columnsDefaultLong;
    }

    vasync.pipeline(
        {
            arg: {cli: this.top},
            funcs: [
                function getEm(ctx, next) {
                    ctx.cli.jirashApi.getFavouriteFilters(function onFilters(
                        err,
                        filters
                    ) {
                        ctx.filters = filters;
                        next(err);
                    });
                },

                function printEm(ctx, next) {
                    if (opts.json) {
                        common.jsonStream(ctx.filters);
                    } else {
                        ctx.filters.forEach(function (filt) {
                            var sharedWith = (filt.sharePermissions || []).map(
                                function (perm) {
                                    if (perm.type === 'group') {
                                        return perm.group.name;
                                    } else {
                                        return perm.type + ':???';
                                    }
                                }
                            );
                            if (sharedWith.length > 0) {
                                filt.sharedWith = sharedWith.join(', ');
                            }
                        });
                        tabula(ctx.filters, {
                            skipHeader: opts.H,
                            columns: columns,
                            sort: opts.s,
                            dottedLookup: true
                        });
                    }
                    next();
                }
            ]
        },
        cb
    );
}

do_list.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    }
].concat(
    common.getCliTableOptions({
        includeLong: true,
        sortDefault: sortDefault
    })
);

do_list.aliases = ['ls'];

do_list.synopses = ['{{name}} {{cmd}} [OPTIONS]'];

do_list.completionArgtypes = ['none'];

do_list.help = [
    'List JIRA filter favourites.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_list;
