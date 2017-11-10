/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/*
 * The `JirashApi`, the jirash wrapper around the JIRA REST API.
 */

var assert = require('assert-plus');
var format = require('util').format;
var restifyClients = require('restify-clients');
var vasync = require('vasync');
var VError = require('verror');

var BunyanNoopLogger = require('./bunyannooplogger');
var common = require('./common');


// ---- internal support stuff

function _stripNullOrUndefined(obj) {
    Object.keys(obj).forEach(function (k) {
        if (obj[k] === undefined || obj[k] === null) {
            delete obj[k];
        }
    });
    return obj;
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
            cb(new VError({name: 'ConfigError'},
                'missing "jira_url" config var'));
            return;
        }

        // `config[$url].username` is the jirash v1 format.
        var username = self._config.jira_username
            || (self._config[url] && self._config[url].username);
        if (!username) {
            cb(new VError({name: 'ConfigError'},
                'missing "jira_username" config var'));
            return;
        }

        // `config[$url].password` is the jirash v1 format.
        var password = self._config.jira_password
            || (self._config[url] && self._config[url].password);
        if (!password) {
            cb(new VError({name: 'ConfigError'},
                'missing "jira_password" config var'));
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
    ctx.api._getJiraClient(function (err, jiraClient) {
        ctx.jiraClient = jiraClient;
        next(err);
    });
}

/*
 * Get issue
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/issue-getIssue
 */
JirashApi.prototype.getIssue = function getIssue(opts, cb) {
    var issueIdOrKey;
    if (typeof(opts) === 'string') {
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

    var self = this;

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

    vasync.pipeline({arg: context, funcs: [
        ctxJiraClient,

        function getIt(ctx, next) {
            ctx.jiraClient.get({
                path: format('/rest/api/2/issue/%s', issueIdOrKey),
                query: ctx.query
            }, function (err, req, res, body) {
                if (err) {
                    next(err);
                } else {
                    ctx.issue = body;
                    next();
                }
            });
        }
    ]}, function finished(err) {
        cb(err, context.issue);
    });
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

    vasync.pipeline({arg: context, funcs: [
        ctxJiraClient,

        function getIt(ctx, next) {
            ctx.jiraClient.get({
                path: format('/rest/api/2/version/%s', id)
            }, function (err, req, res, body) {
                if (err) {
                    next(err);
                } else {
                    ctx.ver = body;
                    next();
                }
            });
        }
    ]}, function finished(err) {
        cb(err, context.ver);
    });
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

    vasync.pipeline({arg: context, funcs: [
        ctxJiraClient,

        function doIt(ctx, next) {
            ctx.jiraClient.put({
                path: format('/rest/api/2/version/%s', opts.id)
            }, opts.data, function (err, req, res, body) {
                ctx.ver = body;
                next(err);
            });
        }
    ]}, function finished(err) {
        cb(err, context.ver);
    });
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

    vasync.pipeline({arg: context, funcs: [
        ctxJiraClient,

        function getIt(ctx, next) {
            self.getProjectVersions(opts.project, function (err, vers) {
                for (var i = 0; i < vers.length; i++) {
                    if (vers[i].name === opts.name) {
                        ctx.ver = vers[i];
                        break;
                    }
                }

                if (ctx.ver) {
                    next();
                } else {
                    next(new VError('no "%s" version on project "%s"',
                        opts.name, opts.project));
                }
            });
        },
    ]}, function finished(err) {
        cb(err, context.ver);
    });
};

/*
 * Get project versions
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/project-getProjectVersions
 */
JirashApi.prototype.getProjectVersions = function getProjectVersions(
        projectIdOrKey, cb) {
    assert.string(projectIdOrKey, 'projectIdOrKey');

    var context = {
        api: this
    };

    vasync.pipeline({arg: context, funcs: [
        ctxJiraClient,

        function getIt(ctx, next) {
            ctx.jiraClient.get({
                path: format('/rest/api/2/project/%s/versions', projectIdOrKey)
            }, function (err, req, res, body) {
                if (err) {
                    next(err);
                } else {
                    ctx.vers = body;
                    next();
                }
            });
        }
    ]}, function finished(err) {
        cb(err, context.vers);
    });
};

/*
 * Search issues
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/search-search
 *
 * TODO: Paging support if maxResults/startAt are not given.
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
    if (Object.hasOwnProperty('startAt')) {
        context.query.startAt = opts.startAt;
    }
    if (Object.hasOwnProperty('maxResults')) {
        context.query.maxResults = opts.maxResults;
    }
    if (opts.validateQuery) {
        // XXX Does this do
        context.query.validateQuery = true;
    }
    if (opts.fields && opts.fields.length) {
        context.query.fields = opts.fields.join(',');
    }
    if (opts.expand && opts.expand.length) {
        context.query.expand = opts.expand.join(',');
    }

    vasync.pipeline({arg: context, funcs: [
        ctxJiraClient,

        function getIt(ctx, next) {
            ctx.jiraClient.get({
                path: '/rest/api/2/search',
                query: ctx.query
            }, function (err, req, res, body) {
                if (err) {
                    next(err);
                } else {
                    ctx.issues = body;
                    next();
                }
            });
        }
    ]}, function finished(err) {
        cb(err, context.issues);
    });
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

    vasync.pipeline({arg: context, funcs: [
        ctxJiraClient,

        function getIt(ctx, next) {
            ctx.jiraClient.get({
                path: format('/rest/api/2/filter/%s', id),
            }, function (err, req, res, body) {
                if (err) {
                    next(err);
                } else {
                    ctx.filter = body;
                    next();
                }
            });
        }
    ]}, function finished(err) {
        cb(err, context.filter);
    });
};

/*
 * Get favourite filters
 * https://docs.atlassian.com/jira/REST/7.4.2/#api/2/filter-getFavouriteFilters
 */
JirashApi.prototype.getFavouriteFilters = function getFavouriteFilters(cb) {
    var context = {
        api: this
    };

    vasync.pipeline({arg: context, funcs: [
        ctxJiraClient,

        function getIt(ctx, next) {
            ctx.jiraClient.get({
                path: '/rest/api/2/filter/favourite',
            }, function (err, req, res, body) {
                if (err) {
                    next(err);
                } else {
                    ctx.filters = body;
                    next();
                }
            });
        }
    ]}, function finished(err) {
        cb(err, context.filters);
    });
};


//---- exports

module.exports = JirashApi;

// vim: set softtabstop=4 shiftwidth=4:
