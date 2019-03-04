/*
 * Copyright (c) 2019, Joyent, Inc.
 */

/*
 * The `JirashApi`, the jirash wrapper around the JIRA REST API.
 */

var assert = require('assert-plus');
var lomstream = require('lomstream');
var restifyClients = require('restify-clients');
var util = require('util');
var vasync = require('vasync');
var VError = require('verror');

var common = require('./common');
var BunyanNoopLogger = require('./bunyannooplogger');

var format = util.format;

// ---- internal support stuff

function _stripNullOrUndefined(obj) {
    Object.keys(obj).forEach(function onKey(k) {
        if (obj[k] === undefined || obj[k] === null) {
            delete obj[k];
        }
    });
    return obj;
}

function has(obj, key) {
    assert.string(key, 'key');
    return (Object.prototype.hasOwnProperty.call(obj, key));
}

// ---- Jirash API class

function JirashApi(args) {
    assert.object(args.config, 'args.config');
    assert.optionalObject(args.log, 'args.log');

    this._config = args.config;
    this._log = args.log || new BunyanNoopLogger();
}

JirashApi.prototype.close = function close(cb) {
    if (this._jiraClient) {
        this._jiraClient.close();
    }
    cb();
};

JirashApi.prototype._getJiraClient = function _getJiraClient(cb) {
    var self = this;

    if (!self._jiraClient) {
        var url = self._config.jira_url;
        if (!url) {
            cb(
                new VError(
                    {name: 'ConfigError'},
                    'missing "jira_url" config var'
                )
            );
            return;
        }

        // `config[$url].username` is the jirash v1 format.
        var username =
            self._config.jira_username ||
            (self._config[url] && self._config[url].username);
        if (!username) {
            cb(
                new VError(
                    {name: 'ConfigError'},
                    'missing "jira_username" config var'
                )
            );
            return;
        }

        // `config[$url].password` is the jirash v1 format.
        var password =
            self._config.jira_password ||
            (self._config[url] && self._config[url].password);
        if (!password) {
            cb(
                new VError(
                    {name: 'ConfigError'},
                    'missing "jira_password" config var'
                )
            );
            return;
        }

        self._jiraClient = restifyClients.createJsonClient({
            log: self._log.child({component: 'jiraClient'}, true),
            url: url
        });
        self._jiraClient.basicAuth(username, password);
    }

    cb(null, self._jiraClient);
};

/*
 * A vasync.pipeline convenience function to get `ctx.client` from
 * `ctx.api` (a JirashApi instance).
 */
function ctxJiraClient(ctx, next) {
    ctx.api._getJiraClient(function onClient(err, jiraClient) {
        ctx.jiraClient = jiraClient;
        next(err);
    });
}

/**
 * API request wrapper - modeled after http.request
 *
 * Dev Note: Very little *uses* this wrapper. It was originally exposed as
 * a convenience for the `jirash api ...` CLI.
 *
 * @param {Object|String} opts - object or string for endpoint
 *      - {String} path - URL endpoint to hit
 *      - {String} method - HTTP(s) request method
 *      - {Object} data - data to be passed
 *      - {Object} headers - optional additional request headers
 * @param {Function} cb passed via the restify client
 */
JirashApi.prototype._request = function _request(opts, cb) {
    if (typeof opts === 'string') {
        opts = {path: opts};
    }
    assert.object(opts, 'opts');
    assert.optionalObject(opts.data, 'opts.data');
    assert.optionalString(opts.method, 'opts.method');
    assert.optionalObject(opts.headers, 'opts.headers');
    assert.func(cb, 'cb');

    var method = (opts.method || 'GET').toLowerCase();
    assert.ok(
        ['get', 'post', 'put', 'delete', 'head'].indexOf(method) >= 0,
        'invalid HTTP method given'
    );
    var clientFnName = method === 'delete' ? 'del' : method;

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function makeRequest(ctx, next) {
                    var reqOpts = {
                        path: opts.path
                    };
                    if (opts.headers) {
                        reqOpts.headers = opts.headers;
                    }
                    if (opts.data) {
                        ctx.jiraClient[clientFnName](
                            reqOpts,
                            opts.data,
                            function onRes(err, req, res, body) {
                                ctx.req = req;
                                ctx.res = res;
                                ctx.body = body;
                                next(err);
                            }
                        );
                    } else {
                        ctx.jiraClient[clientFnName](reqOpts, function onRes(
                            err,
                            req,
                            res,
                            body
                        ) {
                            ctx.req = req;
                            ctx.res = res;
                            ctx.body = body;
                            next(err);
                        });
                    }
                }
            ]
        },
        function finished(err) {
            cb(err, context.req, context.res, context.body);
        }
    );
};

/*
 * Get issue
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/issue-getIssue
 */
JirashApi.prototype.getIssue = function getIssue(opts, cb) {
    var issueIdOrKey;
    if (typeof opts === 'string') {
        issueIdOrKey = opts;
        opts = {};
    } else {
        issueIdOrKey = opts.issueIdOrKey;
    }
    assert.string(issueIdOrKey, 'issueIdOrKey');
    assert.object(opts, 'opts');
    assert.optionalArrayOfString(opts.fields, 'opts.fields');
    assert.optionalArrayOfString(opts.expand, 'opts.expand');
    assert.optionalArrayOfString(opts.properties, 'opts.properties');

    var context = {
        api: this,
        query: {}
    };
    if (opts.fields && opts.fields.length) {
        context.query.fields = opts.fields.join(',');
    }
    if (opts.expand && opts.expand.length) {
        context.query.expand = opts.expand.join(',');
    }
    if (opts.properties && opts.properties.length) {
        context.query.properties = opts.properties.join(',');
    }

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.get(
                        {
                            path: format('/rest/api/2/issue/%s', issueIdOrKey),
                            query: ctx.query
                        },
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.issue = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.issue);
        }
    );
};

/*
 * Create issue
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/issue-createIssue
 */
JirashApi.prototype.createIssue = function createIssue(opts, cb) {
    assert.object(opts.fields, 'opts.fields');
    assert.func(cb, 'cb');

    /*
     * Required fields are type-validated here. Some stock fields are type
     * validated. Other fields are passed through: there are many stock fields,
     * and a project can have custom fields.
     *
     * Possible TODOs:
     * - type-validate more fields
     * - support "update" param
     */
    var fields = opts.fields;
    // Minimally required fields.
    assert.string(fields.summary, 'fields.summary');
    assert.object(fields.project, 'fields.project');
    assert.string(
        fields.project.id || fields.project.key,
        'fields.project.id || fields.project.key'
    );
    assert.object(fields.issuetype, 'fields.issuetype');
    assert.string(
        fields.issuetype.id || fields.issuetype.name,
        'fields.issuetype.id || fields.issuetype.name'
    );

    // Optional stock fields (some of them).
    if (fields.assignee) {
        assert.string(fields.assignee.name, 'fields.assignee.name');
    }
    if (fields.priority) {
        assert.string(fields.priority.id, 'fields.priority.id');
    }
    if (fields.labels) {
        assert.arrayOfString(fields.labels, 'fields.labels');
    }
    if (fields.description) {
        assert.string(fields.description, 'fields.description');
    }
    if (fields.components) {
        assert.arrayOfObject(fields.components, 'fields.components');
    }

    var context = {
        api: this,
        createOpts: {
            fields: fields
        }
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function createIt(ctx, next) {
                    ctx.jiraClient.post(
                        {
                            path: '/rest/api/2/issue'
                        },
                        ctx.createOpts,
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.issue = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.issue);
        }
    );
};

/*
 * Get issue link types.
 * ...#api/2/issueLinkType-getIssueLinkTypes
 *
 * Note that we are returning the array inside the response body object.
 * I.e. we are diverging from raw JIRA REST API here.
 */
JirashApi.prototype.getIssueLinkTypes = function getIssueLinkTypes(cb) {
    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.get(
                        {
                            path: '/rest/api/2/issueLinkType'
                        },
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.types = body.issueLinkTypes;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.types);
        }
    );
};

/*
 * Link issues.
 *
 * E.g.:
 *      jiraapi.linkIssues({
 *          type: {name: 'Duplicate'},
 *          inwardIssue: {key: 'TRITON-1'},
 *          outwardIssue: {key: 'TRITON-2'},
 *          // optional:
 *          comment: {
 *              body: 'blah blah',
 *              visibility: {
 *                  type: 'group',
 *                  value: 'jira-developers'
 *              }
 *          }
 *      }, function (err) {
 *          ...
 *      });
 */
JirashApi.prototype.linkIssues = function linkIssues(opts, cb) {
    assert.object(opts, 'opts');
    assert.object(opts.type, 'opts.type');
    assert.object(opts.inwardIssue, 'opts.inwardIssue');
    assert.object(opts.outwardIssue, 'opts.outwardIssue');
    assert.optionalObject(opts.comment, 'opts.comment');

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.post(
                        {
                            path: '/rest/api/2/issueLink'
                        },
                        opts,
                        next
                    );
                }
            ]
        },
        function finished(err) {
            cb(err);
        }
    );
};

/* eslint-disable max-len */
/*
 * Edit issue
 * https://docs.atlassian.com/software/jira/docs/api/REST/7.4.2/#api/2/issue-editIssue
 */
/* eslint-enable max-len */
JirashApi.prototype.editIssue = function editIssue(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.issueIdOrKey, 'opts.issueIdOrKey');
    assert.object(opts.issueData, 'opts.issueData');

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function putIt(ctx, next) {
                    ctx.jiraClient.put(
                        {
                            path: format('/rest/api/2/issue/%s',
                                opts.issueIdOrKey)
                        },
                        opts.issueData,
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.issue = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.issue);
        }
    );
};

/* eslint-disable max-len */
/*
 * Comment on an issue
 * https://docs.atlassian.com/software/jira/docs/api/REST/7.4.2/#api/2/issue-addComment
 */
/* eslint-enable max-len */
JirashApi.prototype.commentIssue = function commentIssue(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.issueIdOrKey, 'opts.issueIdOrKey');
    assert.string(opts.issueComment, 'opts.issueComment');

    var context = {
        api: this
    };

    var post = {'body': opts.issueComment};

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function putIt(ctx, next) {
                    ctx.jiraClient.post(
                        {
                            path: format('/rest/api/2/issue/%s/comment',
                                opts.issueIdOrKey)
                        },
                        post,
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.issue = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.issue);
        }
    );
};

/*
 * Get metadata relevant for createIssue.
 * https://docs.atlassian.com/jira/REST/cloud/#api/2/issue-getCreateIssueMeta
 */
JirashApi.prototype.getCreateIssueMeta = function getCreateIssueMeta(opts, cb) {
    assert.optionalArrayOfString(opts.projectIds, 'opts.projectIds');
    assert.optionalArrayOfString(opts.projectKeys, 'opts.projectKeys');
    assert.optionalArrayOfString(opts.issuetypeIds, 'opts.issuetypeIds');
    /*
     * Note: Multiple issuetypeNames need to be put in query params like this:
     *      issuetypeNames=Wishlist&issuetypeNames=Task
     * and *not* like this:
     *      issuetypeNames=Wishlist,Task
     *
     * The others can be in either form.
     */
    assert.optionalArrayOfString(opts.issuetypeNames, 'opts.issuetypeNames');
    assert.optionalBool(opts.expand, 'opts.expand');

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.get(
                        {
                            path: '/rest/api/2/issue/createmeta',
                            query: _stripNullOrUndefined({
                                projectIds: opts.projectIds,
                                projectKeys: opts.projectKeys,
                                issuetypeIds: opts.issuetypeIds,
                                issuetypeNames: opts.issuetypeNames,
                                expand: opts.expand
                                    ? 'projects.issuetypes.fields'
                                    : null
                            })
                        },
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.ver = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.ver);
        }
    );
};

/*
 * Get version
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/version-getVersion
 */
JirashApi.prototype.getVersion = function getVersion(id, cb) {
    assert.ok(/^\d+$/.test(id.toString()), 'id (number)');

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.get(
                        {
                            path: format('/rest/api/2/version/%s', id)
                        },
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.ver = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.ver);
        }
    );
};

/*
 * Create version
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/version-createVersion
 */
JirashApi.prototype.createVersion = function createVersion(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.project, 'opts.project');
    assert.string(opts.name, 'opts.name');
    assert.optionalString(opts.releaseDate, 'opts.releaseDate');
    assert.optionalBool(opts.released, 'opts.released');
    assert.optionalBool(opts.archived, 'opts.archived');
    assert.func(cb, 'cb');

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function createIt(ctx, next) {
                    ctx.jiraClient.post(
                        {
                            path: '/rest/api/2/version'
                        },
                        opts,
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.ver = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.ver);
        }
    );
};

/*
 * Update version
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/version-updateVersion
 */
JirashApi.prototype.updateVersion = function updateVersion(opts, cb) {
    assert.ok(/^\d+$/.test(opts.id.toString()), 'opts.id (number)');
    assert.object(opts.data, 'opts.data');
    assert.func(cb, 'cb');

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function doIt(ctx, next) {
                    ctx.jiraClient.put(
                        {
                            path: format('/rest/api/2/version/%s', opts.id)
                        },
                        opts.data,
                        function onRes(err, req, res, body) {
                            ctx.ver = body;
                            next(err);
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.ver);
        }
    );
};

/*
 * Get a version by project and name.
 * (This isn't a standard raw JIRA REST API endpoint.)
 */
JirashApi.prototype.getProjectVersion = function getProjectVersion(opts, cb) {
    assert.string(opts.project, 'opts.project'); // project id or key
    assert.string(opts.name, 'opts.name');
    assert.func(cb, 'cb');

    var self = this;
    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    self.getProjectVersions(opts.project, function onRes(
                        err,
                        vers
                    ) {
                        if (err) {
                            next(err);
                            return;
                        }

                        for (var i = 0; i < vers.length; i++) {
                            if (vers[i].name === opts.name) {
                                ctx.ver = vers[i];
                                break;
                            }
                        }

                        if (ctx.ver) {
                            next();
                        } else {
                            next(
                                new VError(
                                    'no "%s" version on project "%s"',
                                    opts.name,
                                    opts.project
                                )
                            );
                        }
                    });
                }
            ]
        },
        function finished(err) {
            cb(err, context.ver);
        }
    );
};

/*
 * Get project versions
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/project-getProjectVersions
 */
JirashApi.prototype.getProjectVersions = function getProjectVersions(
    projectIdOrKey,
    cb
) {
    assert.string(projectIdOrKey, 'projectIdOrKey');

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.get(
                        {
                            path: format(
                                '/rest/api/2/project/%s/versions',
                                projectIdOrKey
                            )
                        },
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.vers = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.vers);
        }
    );
};

/*
 * Search issues
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/search-search
 *
 * Note: This only returns a single page. For paging, use `createSearchStream`.
 */
JirashApi.prototype.search = function search(opts, cb) {
    assert.object(opts, 'opts');
    assert.string(opts.jql, 'opts.jql');
    assert.optionalFinite(opts.startAt, 'opts.startAt');
    assert.optionalFinite(opts.maxResults, 'opts.maxResults');
    assert.optionalBool(opts.validateQuery, 'opts.validateQuery');
    assert.optionalArrayOfString(opts.fields, 'opts.fields');
    assert.optionalArrayOfString(opts.expand, 'opts.expand');
    assert.func(cb, 'cb');

    var context = {
        api: this,
        query: {
            jql: opts.jql
        }
    };
    if (has(opts, 'startAt')) {
        context.query.startAt = opts.startAt;
    }
    if (has(opts, 'maxResults')) {
        context.query.maxResults = opts.maxResults;
    }
    if (has(opts, 'validateQuery')) {
        context.query.validateQuery = opts.validateQuery;
    }
    if (opts.fields && opts.fields.length) {
        context.query.fields = opts.fields.join(',');
    }
    if (opts.expand && opts.expand.length) {
        context.query.expand = opts.expand.join(',');
    }

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.get(
                        {
                            path: '/rest/api/2/search',
                            query: ctx.query
                        },
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.page = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.page);
        }
    );
};


/*
 * Paging search of issues
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/search-search
 */
JirashApi.prototype.createSearchStream = function createSearchStream(opts) {
    assert.object(opts, 'opts');
    assert.string(opts.jql, 'opts.jql');
    assert.optionalBool(opts.validateQuery, 'opts.validateQuery');
    assert.optionalArrayOfString(opts.fields, 'opts.fields');
    assert.optionalArrayOfString(opts.expand, 'opts.expand');

    var baseSearchOpts = {
        jql: opts.jql
    };
    if (has(opts, 'validateQuery')) {
        baseSearchOpts.validateQuery = opts.validateQuery;
    }
    if (opts.fields && opts.fields.length) {
        baseSearchOpts.fields = opts.fields;
    }
    if (opts.expand && opts.expand.length) {
        baseSearchOpts.expand = opts.expand;
    }
    var self = this;

    function fetchOnePage(_fetchArg, limitInfo, _dataCb, cb) {
        var searchOpts = common.objCopy(baseSearchOpts, {
            startAt: limitInfo.offset,
            maxResults: limitInfo.limit
        });
        self.search(searchOpts, function onSearched(err, page) {
            if (err) {
                cb(err);
            } else {
                var done = false;
                if (limitInfo.offset + page.issues.length >= page.total) {
                    done = true;
                }

                cb(null, {
                    done: done,
                    results: page.issues
                });
            }
        });
    }

    var s = new lomstream.LOMStream({
        fetch: fetchOnePage,
        limit: 50,
        offset: true
    });

    return s;
};

/*
 * Get a filter by ID
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/filter-getFilter
 */
JirashApi.prototype.getFilter = function getFilter(id, cb) {
    assert.ok(/^\d+$/.test(id.toString()), 'id (number)');
    assert.func(cb, 'cb');

    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.get(
                        {
                            path: format('/rest/api/2/filter/%s', id)
                        },
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.filter = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.filter);
        }
    );
};

/*
 * Get favourite filters
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/filter-getFavouriteFilters
 */
JirashApi.prototype.getFavouriteFilters = function getFavouriteFilters(cb) {
    var context = {
        api: this
    };

    vasync.pipeline(
        {
            arg: context,
            funcs: [
                ctxJiraClient,

                function getIt(ctx, next) {
                    ctx.jiraClient.get(
                        {
                            path: '/rest/api/2/filter/favourite'
                        },
                        function onRes(err, req, res, body) {
                            if (err) {
                                next(err);
                            } else {
                                ctx.filters = body;
                                next();
                            }
                        }
                    );
                }
            ]
        },
        function finished(err) {
            cb(err, context.filters);
        }
    );
};

// ---- exports

module.exports = JirashApi;

// vim: set softtabstop=4 shiftwidth=4:
