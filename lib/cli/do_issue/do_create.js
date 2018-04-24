/*
 * Copyright (c) 2018, Joyent, Inc.
 *
 * `jirash issue create [OPTIONS] PROJECT`
 *
 * Additional feature ideas:
 * - issuetype handling (for now just hardcoded to 'Bug')
 * - priority field
 * - Infer component somehow from cwd... repo or package.json info?
 * - See if reasonable to allow desc to be in markdown-ish and convert to
 *   JIRA speak. E.g. ``` -> {code} or {noformat}, etc.
 * - Customizable template per URL? per project?
 * - Have -D PATH (and `-D -`) to read description from file/stdin?
 * - Open in browser option? Else just emit the URL.
 *   If doing this, remember the jirash v1 option to avoid opening.
 */

var assert = require('assert-plus');
var format = require('util').format;
var fs = require('fs');

var UsageError = require('cmdln').UsageError;
var vasync = require('vasync');
var VError = require('verror');

var common = require('../../common');

function parseCommaSepNoEmpties(arg) {
    return arg
        .trim()
        .split(/\s*,\s*/g)
        .filter(function aPart(part) {
            return part;
        });
}

function parseIssueForm(text) {
    var lines = text.split(/\r?\n/g);
    var i = 0;
    var line;
    var parsedFields = {};

    // Leading '#' lines.
    while (i < lines.length) {
        line = lines[i].trimLeft();
        if (line.length && line[0] !== '#') {
            break;
        } else {
            i++;
        }
    }

    // Fields up to and including 'Description:'
    while (i < lines.length) {
        line = lines[i].trimLeft();
        i++;
        if (!line.length) {
            continue;
        }
        // $field:$value
        var idx = line.indexOf(':');
        if (idx === -1) {
            throw new VError(
                {
                    info: {
                        line: i
                    }
                },
                'line %d is not in "Field: value" format: "%s"',
                i,
                line
            );
        }
        var field = line
            .slice(0, idx)
            .trim()
            .toLowerCase();
        var value = line.slice(idx + 1).trim();
        if (field === 'description') {
            parsedFields.description = [];
            if (value) {
                parsedFields.description.push(value);
            }
            break;
        } else {
            parsedFields[field] = value;
        }
    }

    // Description lines.
    while (i < lines.length) {
        line = lines[i];
        i++;
        // Exclude leading blank lines.
        if (parsedFields.description.length !== 0 || line.trim().length !== 0) {
            parsedFields.description.push(line);
        }
    }
    parsedFields.description = parsedFields.description.join('\n').trimRight();

    return parsedFields;
}

function fieldsFromEditor(ctx, next) {
    assert.object(ctx, 'ctx');
    assert.object(ctx.log, 'ctx.log');
    assert.object(ctx.opts, 'ctx.opts');
    assert.optionalString(ctx.formFile, 'ctx.formFile');
    assert.func(next, 'next');

    if (!ctx.useEditor) {
        next();
        return;
    }

    var editLine;
    var text;

    if (ctx.formFile) {
        try {
            text = fs.readFileSync(ctx.formFile, 'utf8');
        } catch (readErr) {
            next(readErr);
            return;
        }

        ctx.editFilename = ctx.formFile;
    } else {
        text = [
            '# Edit the new ' + ctx.projectKey + ' issue fields. Field notes:',
            '#',
            '#   Summary: Required.',
            '#   Assignee: Use "me" to assign to yourself, blank for ' +
                'project default.',
            // TODO: Fill in available types.
            // '#   Type: ...',
            // TODO: Fill in available components.
            // '#   Components: ...',
            '#',
            '# Leading lines starting with "#" are dropped.',
            'Summary: ' + (ctx.fields.summary || ''),
            'Type: ' +
                ((ctx.fields.issuetype && ctx.fields.issuetype.name) || ''),
            'Assignee: ',
            'Components: ',
            // TODO: labels. What's the story with validating labels? We
            //      don't want accidental newly created ones all the time.
            'Description:',
            '',
            ''
        ].join('\n');

        var timestamp = new Date()
            .toISOString()
            .split('.')[0]
            .replace(/[:.-]/g, ''); // "YYYYMMDDTHHMMSS"
        ctx.editFilename = format(
            './jirash-%s-%s.issue',
            timestamp,
            ctx.projectKey
        );
    }

    // Edit on 'Summary:' line if empty, else on 'Description:'.
    var summaryLine;
    var lines = text.split(/\r?\n/g);
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].slice(0, 8) === 'Summary:') {
            summaryLine = i + 1;
            var val = lines[i].slice(9).trim();
            if (!val) {
                editLine = i + 1;
            } else {
                editLine = lines.length + 1;
            }
            break;
        }
    }

    var editAttempt = function editAttempt() {
        common.editInEditor(
            {
                text: text,
                filename: ctx.editFilename,
                line: editLine,
                noUnlink: true,
                log: ctx.log
            },
            function onEdit(editErr, updatedText) {
                if (editErr) {
                    next(editErr);
                    return;
                }

                text = updatedText;
                editLine = null;

                try {
                    var parsedForm = parseIssueForm(updatedText);
                } catch (parseErr) {
                    console.error('* * *\nerror: ' + parseErr.message);
                    common.promptEnter(
                        'Press <Enter> to re-edit, <Ctrl+C> to abort.',
                        function onResponse(promptErr) {
                            if (promptErr) {
                                console.error('\nAborting.');
                                next(true);
                            } else {
                                var errLine = VError.info(parseErr).line;
                                if (errLine) {
                                    editLine = errLine;
                                }
                                setImmediate(editAttempt);
                            }
                        }
                    );
                    return;
                }

                ctx.log.trace({parsedForm: parsedForm}, 'parsed issue form');

                if (!parsedForm.summary) {
                    console.error('* * *\nerror: Summary is empty');
                    common.promptEnter(
                        'Press <Enter> to re-edit, <Ctrl+C> to abort.',
                        function onResponse(promptErr) {
                            if (promptErr) {
                                console.error('\nAborting.');
                                next(true);
                            } else {
                                editLine = summaryLine;
                                setImmediate(editAttempt);
                            }
                        }
                    );
                    return;
                }

                var err;
                Object.keys(parsedForm).forEach(function aField(field) {
                    switch (field) {
                        case 'summary':
                            ctx.fields.summary = parsedForm.summary;
                            break;
                        case 'type':
                            // TODO: matching against possible types, use
                            //      default (first one?) if blank
                            ctx.fields.issuetype = {
                                name: parsedForm.type
                            };
                            break;
                        case 'assignee':
                            if (parsedForm.assignee === 'me') {
                                ctx.fields.assignee = {
                                    name: ctx.jiraUsername
                                };
                            } else {
                                ctx.fields.assignee = {
                                    name: parsedForm.assignee
                                };
                            }
                            break;
                        case 'description':
                            ctx.fields.description = parsedForm.description;
                            break;
                        case 'components':
                            ctx.fields.components = parseCommaSepNoEmpties(
                                parsedForm.components
                            ).map(function componentFromName(name) {
                                return {name: name};
                            });
                            break;
                        case 'labels':
                            ctx.fields.labels = parseCommaSepNoEmpties(
                                parsedForm.labels
                            );
                            break;
                        default:
                            err = new VError(
                                'unknown parsed issue field: ' + field
                            );
                            return;
                    }
                });

                next(err);
            }
        );
    };

    setImmediate(editAttempt);
}

function do_create(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length !== 1) {
        cb(new UsageError('incorrect number of args'));
        return;
    }

    var log = this.top.log;
    var context = {
        cli: this.top,
        jiraUsername: this.top.config.jira_username,
        jiraUrl: this.top.config.jira_url,
        log: log,
        opts: opts,
        projectKey: args[0],
        useEditor: opts.no_edit ? false : true,
        fields: {
            project: {
                key: args[0]
            }
        }
    };

    if (opts.edit && opts.no_edit) {
        cb(new UsageError('cannot specify both "--edit" and "--no-edit"'));
        return;
    }

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                /*
                 * Get create metadata to support filling out and validating
                 * issue form fields. We cache this for a long while because
                 * this takes too long to run for each `jirash create ...`
                 * invocation.
                 *
                 * Dev Note: consider expand=true which has schema on fields.
                 */
                function getCreateMeta(_, next) {
                    next();
                    // ctx.cli.jirashApi.getCreateIssueMeta({
                    //     projectKeys: [ctx.projectKey]
                    // }, function (err, meta) {
                    //     ctx.meta = meta;
                    //     ctx.log.info({meta: meta}, 'create meta');
                    //     next(err);
                    // });
                },

                function fieldsFromInputs(ctx, next) {
                    if (opts.f) {
                        next();
                        return;
                    }

                    if (opts.summary) {
                        ctx.fields.summary = opts.summary;
                    }
                    if (opts.assignee) {
                        if (opts.assignee === 'me') {
                            ctx.fields.assignee = {name: ctx.jiraUsername};
                        } else {
                            ctx.fields.assignee = {name: opts.assignee};
                        }
                    }
                    if (opts.description) {
                        ctx.fields.description = opts.description;
                    }
                    if (opts.components) {
                        ctx.fields.components = opts.components.map(
                            function componentFromName(name) {
                                return {name: name};
                            }
                        );
                    }

                    /*
                     * An issuetype is required to create an issue.
                     *
                     * If not given, choose the first non-subtask issue type
                     * (issuetype.subtask=false) in the create metadata
                     * (ctx.meta).
                     *
                     * If given, do a match against all subtask=false names
                     * from ^^.
                     *
                     * TODO: issuetype
                     */
                    ctx.fields.issuetype = {
                        name: opts.type || 'Bug'
                    };

                    next();
                },

                function fieldsFromFile(ctx, next) {
                    if (!opts.f) {
                        next();
                        return;
                    }

                    var text;
                    try {
                        text = fs.readFileSync(ctx.opts.f, 'utf8');
                    } catch (readErr) {
                        next(readErr);
                        return;
                    }

                    var fileFields;
                    try {
                        fileFields = JSON.parse(text);
                    } catch (_jsonParseErr) {
                        fileFields = null;
                    }
                    if (fileFields === null) {
                        // TODO: Support parsing fields from a jirash form.
                        // Currently this is buried in fieldsFromEditor.
                        ctx.formFile = opts.f;
                        next();
                        return;
                    } else {
                        if (
                            fileFields.project &&
                            fileFields.project.key &&
                            fileFields.project.key !== ctx.fields.project.key
                        ) {
                            next(
                                new VError(
                                    'Issue project.key from "%s", "%s", ' +
                                        'does not match PROJECT arg, "%s"',
                                    ctx.opts.f,
                                    fileFields.project.key,
                                    ctx.fields.project.key
                                )
                            );
                            return;
                        }
                        ctx.fields = fileFields;
                        next();
                    }
                },

                fieldsFromEditor,

                function createIt(ctx, next) {
                    log.trace(
                        {dryRun: opts.dry_run, fields: ctx.fields},
                        'createIssue'
                    );

                    if (opts.dry_run) {
                        console.log(
                            'Creating (dry-run) %s issue:\n%s',
                            ctx.projectKey,
                            common.indent(JSON.stringify(ctx.fields, null, 4))
                        );
                        ctx.issue = {
                            key: ctx.projectKey + '-NNN',
                            dryRun: true
                        };
                        next();
                        return;
                    }

                    ctx.cli.jirashApi.createIssue(
                        {
                            fields: ctx.fields
                        },
                        function onCreate(err, issue) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.issue = issue;
                                next();
                            }
                        }
                    );
                },

                function printIt(ctx, next) {
                    if (opts.json) {
                        console.log(JSON.stringify(ctx.issue, null, 4));
                    } else {
                        console.log(
                            'Created issue %s (%s/browse/%s).',
                            ctx.issue.key,
                            ctx.jiraUrl,
                            ctx.issue.key
                        );
                    }
                    next();
                }
            ]
        },
        function finish(err) {
            if (err) {
                if (context.editFilename) {
                    console.log(
                        'Issue form was saved to "%s".\n' +
                            'Use "jirash create -f %s %s" to retry.',
                        context.editFilename,
                        context.editFilename,
                        context.projectKey
                    );
                }
                cb(err);
            } else if (context.editFilename && !opts.f) {
                /*
             * Clean up the temporary edit filename on success.
             */
                log.trace(
                    {editFilename: context.editFilename},
                    'unlink editFilename'
                );
                fs.unlink(context.editFilename, function onUnlink(unlinkErr) {
                    if (unlinkErr) {
                        log.debug(unlinkErr, 'error unlinking editFilename');
                        console.error(
                            'warning: could not delete temporary file "%s": %s',
                            context.editFilename,
                            unlinkErr
                        );
                    }
                    cb();
                });
            } else {
                cb();
            }
        }
    );
}

do_create.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['dry-run', 'n'],
        type: 'bool',
        help: 'Go through the motions without actually creating the issue.'
    },
    {
        names: ['edit', 'e'],
        type: 'bool',
        help:
            'Edit issue fields in your $EDITOR. This is the default ' +
            'behaviour.'
    },
    {
        names: ['no-edit', 'E'],
        type: 'bool',
        help: 'Do *not* edit issue fields in your $EDITOR.'
    },
    {
        names: ['f'],
        type: 'string',
        helpArg: 'FILE',
        help:
            'Path to a file that describes the issue to create. This is ' +
            'either a JSON object (see the output of `jirash issue create ' +
            '--dry-run ...` for the format) or a jirash issue form (often ' +
            'used for re-editing after an earlier creation error).'
    },
    {
        group: 'Issue data (ignored if "-f FILE" is used)'
    },
    {
        names: ['summary', 's'],
        type: 'string',
        helpArg: 'SUMM',
        help: 'One-line ticket summary.'
    },
    {
        names: ['type', 't'],
        type: 'string',
        helpArg: 'TYPE',
        // TODO: integration issuetype validation
        // help: 'Issue type. If not given, the first (non-subtask) type for '
        //    + 'the given PROJECT is used. See `jirash issuetypes PROJECT`.'
        help: 'Issue type. Currently defaults to "Bug".'
    },
    {
        names: ['assignee', 'a'],
        type: 'string',
        helpArg: 'USER',
        help:
            'User to which to assign the ticket. Use "me" to assign to ' +
            'yourself. Leave blank for the server-side default.'
    },
    {
        names: ['description', 'd'],
        type: 'string',
        helpArg: 'DESC',
        help: 'Issue description (in JIRA markup format).'
    },
    {
        names: ['components', 'c'],
        type: 'arrayOfCommaSepString',
        helpArg: 'COMP',
        help: 'Components to which issue should belong.'
    }
    // TODO: labels
    // {
    //    names: ['labels', 'l'],
    //    type: 'arrayOfCommaSepString',
    //    helpArg: 'LABEL,...',
    //    help: 'Labels to assign to this issue.'
    // }
];

do_create.synopses = ['{{name}} {{cmd}} [OPTIONS] PROJECT'];

do_create.completionArgtypes = ['jirashproject', 'none'];

// prettier-ignore
do_create.help = [
    'Create an issue.',
    '',
    '{{usage}}',
    '',
    '{{options}}'
].join('\n');

module.exports = do_create;
