/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash filter list ...`
 */

var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('VError');

var common = require('../../common');


var columnsDefault = 'id,name,owner.name'.split(/,/g);
var columnsDefaultLong = 'id,name,owner.name,viewUrl,jql'.split(/,/g);
var sortDefault = 'name'.split(/,/g);

function do_list(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 0) {
        return cb(new UsageError('incorrect number of args'));
    }

    var self = this;
    var log = this.log;

    var columns = columnsDefault;
    if (opts.o) {
        columns = opts.o;
    } else if (opts.long) {
        columns = columnsDefaultLong;
    }

    vasync.pipeline({arg: {cli: this.top}, funcs: [
        function getEm(ctx, next) {
            ctx.cli.jirashApi.getFavouriteFilters(function (err, filters) {
                ctx.filters = filters;
                next(err);
            });
        },

        function printEm(ctx, next) {
            if (opts.json) {
                common.jsonStream(ctx.filters);
            } else {
                tabula(ctx.filters, {
                    skipHeader: opts.H,
                    columns: columns,
                    sort: opts.s,
                    dottedLookup: true
                });
            }
            next();
        }
    ]}, cb);
}

do_list.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
].concat(common.getCliTableOptions({
    includeLong: true,
    sortDefault: sortDefault
}));

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
