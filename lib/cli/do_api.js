/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash api ...` for raw JIRA REST API requests.
 */

var http = require('http');
var VError = require('verror');

function do_api(subcmd, opts, args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    } else if (args.length < 1) {
        cb(new Error('invalid arguments'));
        return;
    }

    // Get `reqOpts` from given options.
    var method = opts.method;
    if (!method) {
        if (opts.data) {
            method = 'PUT';
        } else {
            method = 'GET';
        }
    }
    var reqOpts = {
        method: method.toLowerCase(),
        headers: {},
        path: '/rest/api/2' + args[0]
    };
    if (opts.header) {
        for (var i = 0; i < opts.header.length; i++) {
            var raw = opts.header[i];
            var j = raw.indexOf(':');
            if (j < 0) {
                cb(new VError('failed to parse header: ' + raw));
                return;
            }
            var header = raw.substr(0, j);
            var value = raw.substr(j + 1).trimLeft();
            reqOpts.headers[header] = value;
        }
    }
    if (opts.data) {
        try {
            reqOpts.data = JSON.parse(opts.data);
        } catch (parseErr) {
            cb(
                new VError(
                    parseErr,
                    'given DATA is not valid JSON: ' + parseErr.message
                )
            );
            return;
        }
    }

    this.jirashApi._request(reqOpts, function onRes(err, req, res, body) {
        if (err) {
            cb(err);
            return;
        }
        if (opts.headers || reqOpts.method === 'head') {
            console.error(
                '%s/%s %d %s',
                req.connection.encrypted ? 'HTTPS' : 'HTTP',
                res.httpVersion,
                res.statusCode,
                http.STATUS_CODES[res.statusCode]
            );
            Object.keys(res.headers).forEach(function aHeader(key) {
                console.log('%s: %s', key, res.headers[key]);
            });
            console.error();
        }

        if (reqOpts.method !== 'head')
            console.log(JSON.stringify(body, null, 4));
        cb();
    });
}

do_api.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['method', 'X'],
        type: 'string',
        helpArg: 'METHOD',
        help: 'Request method to use. Default is "GET".'
    },
    {
        names: ['header', 'H'],
        type: 'arrayOfString',
        helpArg: 'HEADER',
        help: 'Headers to send with request.'
    },
    {
        names: ['headers', 'i'],
        type: 'bool',
        help: 'Print response headers to stderr.'
    },
    {
        names: ['data', 'd'],
        type: 'string',
        helpArg: 'DATA',
        help: 'Add POST data. This must be valid JSON.'
    }
];

do_api.synopses = [
    '{{name}} {{cmd}} [-X METHOD] [-H HEADER=VAL] [-d DATA] ENDPOINT'
];

do_api.help = [
    'Make a raw JIRA REST API request.',
    '',
    'See: <https://docs.atlassian.com/jira/REST/latest>.',
    'The leading "/rest/api/2" part of the URL is assumed.',
    '',
    '{{usage}}',
    '',
    '{{options}}',
    'Examples:',
    '    {{name}} {{cmd}} /project/TRITON/versions',
    '    {{name}} {{cmd}} /issue/TRITON-1'
].join('\n');

do_api.hidden = true;

module.exports = do_api;
