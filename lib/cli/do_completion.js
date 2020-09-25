/*
 * Copyright (c) 2017, Joyent, Inc.
 *
 * `jirash completion ...`
 */

var fs = require('fs');
var path = require('path');

// Replace {{variable}} in `s` with the template data in `d`.
function renderTemplate(s, d) {
    return s.replace(/{{([a-zA-Z_]+)}}/g, function onMatch(match, key) {
        return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : match;
    });
}

function do_completion(subcmd, opts, _args, cb) {
    if (opts.help) {
        this.do_help('help', {}, [subcmd], cb);
        return;
    }

    if (opts.raw) {
        console.log(this.bashCompletionSpec());
    } else {
        var specExtraIn = fs.readFileSync(
            path.join(__dirname, '../../etc/jirash-bash-completion-types.sh'),
            'utf8'
        );
        var specExtra = renderTemplate(specExtraIn, {
            // TODO: See node-triton/lib/do_completion for static vals example.
        });
        console.log(this.bashCompletion({specExtra: specExtra}));
    }
    cb();
}

do_completion.options = [
    {
        names: ['help', 'h'],
        type: 'bool',
        help: 'Show this help.'
    },
    {
        names: ['raw'],
        type: 'bool',
        hidden: true,
        help:
            'Only output the Bash completion "spec". ' +
            'This is only useful for debugging.'
    }
];
do_completion.help = [
    'Emit bash completion. See help for installation.',
    '',
    'Installation (Mac):',
    '    {{name}} completion > /usr/local/etc/bash_completion.d/{{name}} \\',
    '        && source /usr/local/etc/bash_completion.d/{{name}}',
    '',
    'Installation (Linux):',
    '    sudo {{name}} completion > /etc/bash_completion.d/{{name}} \\',
    '        && source /etc/bash_completion.d/{{name}}',
    '',
    'Alternative installation:',
    '    {{name}} completion > ~/.{{name}}.completion  # or to whatever path',
    '    echo "source ~/.{{name}}.completion" >> ~/.bashrc',
    '',
    '{{options}}'
].join('\n');

module.exports = do_completion;
