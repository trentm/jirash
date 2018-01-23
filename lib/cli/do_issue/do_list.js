/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash issue list FILTER`
 */

var format = require('util').format;
var tabula = require('tabula');
var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var common = require('../../common');

var columnsDefault = [
    'key',
    'shortSummary',
    'components',
    'assignee',
    'p',
    'stat',
    'created',
    'updated'
];
var columnsDefaultLong = [
    'key',
    'priority',
    'status',
    'type',
    'reporter',
    'assignee',
    'created',
    'updated',
    'resolved',
    'components',
    'summary'
];
var columnsDefaultShort = ['key', 'summary'];
var sortDefault = null;

function do_list(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 1) {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    var log = this.top.log;
    var filterIdOrName = args[0];

    var columns = columnsDefault;
    if (opts.o) {
        columns = opts.o;
    } else if (opts.long) {
        columns = columnsDefaultLong;
    } else if (opts.short) {
        columns = columnsDefaultShort;
    }

    vasync.pipeline(
        {
            arg: {cli: this.top},
            funcs: [
                function getFilterById(ctx, next) {
                    if (!/^\d+$/.test(filterIdOrName)) {
                        next();
                        return;
                    }

                    ctx.cli.jirashApi.getFilter(filterIdOrName, function onFilt(
                        err,
                        filter
                    ) {
                        ctx.filter = filter;
                        log.trace({filter: filter}, 'getFilterById');
                        next(err);
                    });
                },

                function getFilterByName(ctx, next) {
                    if (ctx.filter) {
                        next();
                        return;
                    }

                    ctx.cli.jirashApi.getFavouriteFilters(function onFilters(
                        err,
                        filters
                    ) {
                        if (err) {
                            next(err);
                            return;
                        }

                        var errmsgs = [];
                        var i;
                        var matches;
                        var pat;
                        var term = filterIdOrName;
                        var termLower = term.toLowerCase();

                        // First try an exact name match (case-sensitive).
                        for (i = 0; i < filters.length; i++) {
                            if (filters[i].name === term) {
                                ctx.filter = filters[i];
                                next();
                                return;
                            }
                        }

                        // Next, exact name (case-insensitive).
                        for (i = 0; i < filters.length; i++) {
                            if (filters[i].name.toLowerCase() === termLower) {
                                ctx.filter = filters[i];
                                next();
                                return;
                            }
                        }

                        // Next, try a whole word match (case-sensitive);
                        matches = [];
                        pat = new RegExp('\\b' + term + '\\b');
                        filters.forEach(function aFilter(filter) {
                            if (pat.test(filter.name)) {
                                matches.push(filter);
                            }
                        });
                        if (matches.length === 1) {
                            ctx.filter = matches[0];
                            next();
                            return;
                        } else if (matches.length > 1) {
                            errmsgs.push(
                                format(
                                    'filter term /\\b%s\\b/ is ambiguous, it ' +
                                        'matches %d filters: "%s"',
                                    filterIdOrName,
                                    matches.length,
                                    matches
                                        .map(function aFilter(f) {
                                            return f.name;
                                        })
                                        .join('", "')
                                )
                            );
                        }

                        // Next, try a whole word match (case-insensitive)
                        matches = [];
                        pat = new RegExp('\\b' + term + '\\b', 'i');
                        filters.forEach(function aFilter(filter) {
                            if (pat.test(filter.name)) {
                                matches.push(filter);
                            }
                        });
                        if (matches.length === 1) {
                            ctx.filter = matches[0];
                            next();
                            return;
                        } else if (matches.length > 1) {
                            errmsgs.push(
                                format(
                                    'filter term /\\b%s\\b/i is ambiguous, ' +
                                        'it matches %d filters: "%s"',
                                    filterIdOrName,
                                    matches.length,
                                    matches
                                        .map(function aFilter(f) {
                                            return f.name;
                                        })
                                        .join('", "')
                                )
                            );
                        }

                        // Next, try a substring match.
                        matches = [];
                        pat = new RegExp(term, 'i');
                        filters.forEach(function aFilter(filter) {
                            if (pat.test(filter.name)) {
                                matches.push(filter);
                            }
                        });
                        if (matches.length === 1) {
                            ctx.filter = matches[0];
                            next();
                            return;
                        } else if (matches.length > 1) {
                            errmsgs.push(
                                format(
                                    'filter term /%s/i is ambiguous, it ' +
                                        'matches %d filters: "%s"',
                                    filterIdOrName,
                                    matches.length,
                                    matches
                                        .map(function aFilter(f) {
                                            return f.name;
                                        })
                                        .join('", "')
                                )
                            );
                        }

                        // Fail.
                        if (errmsgs.length) {
                            next(new VError(errmsgs.join('; ')));
                        } else {
                            next(
                                new VError(
                                    'no favourite filter names match "%s"',
                                    filterIdOrName
                                )
                            );
                        }
                    });
                },

                function listEm(ctx, next) {
                    var fields;
                    if (opts.long) {
                        fields = [
                            'summary',
                            'components',
                            'reporter',
                            'assignee',
                            'priority',
                            'issuetype',
                            'status',
                            'created',
                            'updated',
                            'resolutiondate'
                        ];
                    } else if (opts.json || opts.o) {
                        // nothing, want all fields (TODO: improve this)
                    } else {
                        fields = [
                            'summary',
                            'components',
                            'reporter',
                            'assignee',
                            'priority',
                            'status',
                            'created',
                            'updated'
                        ];
                    }

                    // XXX paging with a searchPaging or whatever
                    ctx.cli.jirashApi.search(
                        {
                            jql: ctx.filter.jql,
                            fields: fields
                        },
                        function onSearch(err, page) {
                            ctx.issues = page.issues;
                            next(err);
                        }
                    );
                },

                function printEm(ctx, next) {
                    if (opts.json) {
                        common.jsonStream(ctx.issues);
                    } else {
                        ctx.issues.forEach(function anIssue(issue) {
                            var fields = issue.fields;
                            issue.shortSummary =
                                fields.summary.length > 40
                                    ? fields.summary.slice(0, 39) + '\u2026'
                                    : fields.summary;
                            issue.summary = fields.summary;
                            issue.components = fields.components.map(
                                function nameFromComp(comp) {
                                    return comp.name; }).join(',') || null;
                            issue.assignee =
                                (fields.assignee && fields.assignee.name) ||
                                null;
                            issue.reporter = fields.reporter.name;
                            issue.p = fields.priority.name[0];
                            issue.priority = fields.priority.name;
                            issue.stat = fields.status.name.slice(0, 4);
                            issue.status = fields.status.name;
                            issue.created = fields.created.slice(0, 10);
                            issue.updated = fields.updated.slice(0, 10);
                            issue.resolved =
                                fields.resolutiondate &&
                                fields.resolutiondate.slice(0, 10);
                            issue.type =
                                (fields.issuetype && fields.issuetype.name) ||
                                null;
                        });
                        tabula(ctx.issues, {
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
]
    .concat(
        common.getCliTableOptions({
            includeLong: true,
            sortDefault: sortDefault
        })
    )
    .concat([
        {
            names: ['short', 'S'],
            type: 'bool',
            help:
                '"Short" output. Fewer column are displayed to show ' +
                'full summary.'
        }
    ]);

do_list.aliases = ['ls'];

do_list.synopses = ['{{name}} {{cmd}} [OPTIONS] FILTER'];

do_list.completionArgtypes = ['jirafilter', 'none'];

do_list.help = [
    'List issues in the given JIRA filter.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'FILTER is a filter ID, or the name or partial name match of your',
    'favourite filters. Use `jirash filter list` to list favourite filters.'
].join('\n');

module.exports = do_list;
