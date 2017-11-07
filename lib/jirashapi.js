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
            log: self.log,
            url: url
        });
        self._jiraClient.basicAuth(username, password);
    }

    cb(null, self._jiraClient);
};


JirashApi.prototype.listVersions = function listVersions(proj, cb) {
    var client;
    var self = this;
    var vers;

    assert.string(proj, 'proj');

    vasync.pipeline({funcs: [
        // XXX cleaner, shared code
        function theClient(_, next) {
            self.getJiraClient(function (err, jiraClient) {
                client = jiraClient;
                next(err);
            });
        },

        function theVers(_, next) {
            client.get({
                path: format('/rest/api/2/project/%s/versions', proj)
            }, function (err, req, res, body) {
                if (err) {
                    next(err);
                } else {
                    vers = body;
                    next();
                }
            });
        }
    ]}, function finished(err) {
        cb(err, vers);
    });
};


//---- exports

module.exports = JirashApi;

// vim: set softtabstop=4 shiftwidth=4:
