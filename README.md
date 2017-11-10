A limited JIRA CLI. Get an issue. Create an issue. Update project versions.
Etc.

# Install

    npm install -g jirash
    jirash --version

This supports Bash completion. Install it something like this:

    # Mac
    jirash completion > /usr/local/etc/bash_completion.d/jirash \
        && source /usr/local/etc/bash_completion.d/jirash

    # Linux
    sudo jirash completion > /etc/bash_completion.d/jirash \
        && source /etc/bash_completion.d/jirash

# Config

First you need a config file with Jira URL and auth info:

    $ cat ~/.jirash.json
    {
        "jira_url": "https://jira.example.com",
        "jira_username": "joe.blow",
        "jira_password": "secret"
    }

# Usage

List available commands:

    $ jirash help
    Usage:
        jirash COMMAND [ARGS...]
        jirash help [COMMAND]
    ...
    Commands:
    ...
        issue       Search, get, and create JIRA issues.
    ...


Some examples follow. **Get info on an issue**:

    $ jirash issue get IMGAPI-654
    IMGAPI-654 IMGAPI ExportImage when basename(MANTA_PATH) doesn't exist is (a) wrong and (b) unhelpful (trent.mick -> <unassigned>, Bug, 4 - Normal, Open)

A shortcut for that:

    $ jirash IMGAPI-654

A full JSON dump of REST API data for the issue:

    $ jirash issue get -j IMGAPI-654
    {
        "id": "64401",
        "self": "https://jira.joyent.us/rest/api/2/issue/64401",
        "key": "IMGAPI-654",
        "fields": {
    ...

**List your favourite filters** (saved issue searches):

    $ jirash filter ls
    ID     NAME                                       OWNER.NAME
    10644  ADMINUI: open issues                       trent.mick
    10580  AGENT: open issues                         trent.mick
    10577  All issues                                 trent.mick
    ...

**List issues in a filter:**

    $ jirash issue ls AGENT
    KEY         SUMMARYCLIPPED                            ASSIGNEE     REPORTER    P  STAT  CREATED     UPDATED
    AGENT-1083  Want auto.DATACENTER_NAME in config-age…  cody.mello   cody.mello  4  Open  2017-09-26  2017-09-26
    AGENT-1081  config-agent could use one-shot mode fo…  dap          dap         3  Open  2017-08-01  2017-08-01
    AGENT-1080  hagfish-watcher should use sdcnode        josh.clulow  trent.mick  4  Open  2017-07-14  2017-07-14
    ...


# Configuration Reference

Configuration is via a JSON file at "~/.jirash.json". Example:

    {
        "jira_url": "https://dev.example.com/jira",
        "jira_username": "joe.blow",
        "jira_password": "secret"
    }

The possible config vars are:

- `jira_url` The base Jira URL. This or `jirash -J <jira-url> ...` is required.
- `jira_username` Required. The Jira username with which to auth.
- `jira_password` Required. The password for the given Jira username.


# Module Usage

There is a lib/jirashapi.js that is a reasonable REST API wrapper, albeit
with coverage of very little of the [JIRA REST
API](https://docs.atlassian.com/jira/REST/server/).

    var JirashApi = require('jirash').JirashApi;

    var config = require('/Users/trentm/.jirash.json');
    var api = new JirashApi({config: config});

    api.getIssue('IMGAPI-654', function (err, issue) {
        if (err) {
            // Handle `err`.
        }
        console.log(issue);
            // { id: '64401',
            //  self: 'https://jira.joyent.us/rest/api/2/issue/64401',
            //  key: 'IMGAPI-654',
            //  fields:
            //  ...
    });


# License

MIT. See the [LICENSE.txt file](./LICENSE.txt).
