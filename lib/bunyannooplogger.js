/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2017, Joyent, Inc.
 */

/*
 * A stub for a `bunyan.createLogger()` that does no logging.
 */
function BunyanNoopLogger() {}
BunyanNoopLogger.prototype.trace = function trace() {};
BunyanNoopLogger.prototype.debug = function debug() {};
BunyanNoopLogger.prototype.info = function info() {};
BunyanNoopLogger.prototype.warn = function warn() {};
BunyanNoopLogger.prototype.error = function error() {};
BunyanNoopLogger.prototype.fatal = function fatal() {};
BunyanNoopLogger.prototype.child = function child() {
    return this;
};
BunyanNoopLogger.prototype.end = function end() {};

module.exports = BunyanNoopLogger;
