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
    this._config = args.config;
    this._log = args.log;
}


JirashApi.prototype.close = function close(cb) {
    if (this._jiraClient) {
        this._jiraClient.close();
    }
    cb();
};


JirashApi.prototype.getJiraClient = function getJiraClient(cb) {
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
    ctx.api.getJiraClient(function (err, jiraClient) {
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
        context.query.fields = fields.join(',');
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
