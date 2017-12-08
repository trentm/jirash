/*
 * Copyright (c) 2017, Joyent, Inc.
 */

var assert = require('assert-plus');

/*
 * ctx.verId -> use getVersion
 * ctx.verProject and ctx.verName -> use getProjectVersion
 *
 * Sets `ctx.ver` or calls back with and `err`.
 */
function ctxVer(ctx, next) {
    assert.object(ctx.cli.jirashApi, 'ctx.cli.jirashApi');

    if (ctx.verId) {
        assert.ok(/^\d+$/.test(ctx.verId.toString()), 'ctx.verId number');

        ctx.cli.jirashApi.getVersion(ctx.verId, function onVer(err, ver) {
            ctx.ver = ver;
            next(err);
        });
    } else {
        assert.string(ctx.verProject, 'ctx.verProject');
        assert.string(ctx.verName, 'ctx.verName');

        ctx.cli.jirashApi.getProjectVersion(
            {
                project: ctx.verProject,
                name: ctx.verName
            },
            function onVer(err, ver) {
                ctx.ver = ver;
                next(err);
            }
        );
    }
}

module.exports = {
    ctxVer: ctxVer
};
