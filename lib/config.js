/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var assert = require('assert-plus');
var fs = require('fs');
var VError = require('verror');

var common = require('./common');


var CONFIG_PATH = common.tildeSync('~/.jirash.json');


/**
 * Load (synchronously) the Jirash config.
 *
 * @returns {Object} The loaded config.
 */
function loadConfig() {
    var config;
    var configPath = common.tildeSync(CONFIG_PATH);

    if (fs.existsSync(configPath)) {
        var content = fs.readFileSync(configPath, 'utf8');
        try {
            config = JSON.parse(content);
        } catch (parseErr) {
            throw new VError({name: 'ConfigError'},
                '"%s" is invalid JSON', configPath);
        }
    }

    return config;
}



//---- exports

module.exports = {
    loadConfig: loadConfig
};

// vim: set softtabstop=4 shiftwidth=4:
