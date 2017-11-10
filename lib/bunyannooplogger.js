/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2015 Joyent, Inc.
 */

/*
 * A stub for a `bunyan.createLogger()` that does no logging.
 */
function BunyanNoopLogger() {}
BunyanNoopLogger.prototype.trace = function () {};
BunyanNoopLogger.prototype.debug = function () {};
BunyanNoopLogger.prototype.info = function () {};
BunyanNoopLogger.prototype.warn = function () {};
BunyanNoopLogger.prototype.error = function () {};
BunyanNoopLogger.prototype.fatal = function () {};
BunyanNoopLogger.prototype.child = function () { return this; };
BunyanNoopLogger.prototype.end = function () {};


module.exports = BunyanNoopLogger;
