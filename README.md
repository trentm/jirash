A Jira shell. Show a ticket. Create an issue. List projects.
That sort of thing.

# Getting Started

Get jirash:

    $ cd ~/opt
    $ git clone https://github.com/trentm/jirash.git
    $ alias jirash='$HOME/opt/jirash/bin/jirash'      # or whatever

First you need a config file with Jira URL and auth info:

    $ cat ~/.jirash.json
    {
      "jira_url": "https://dev.example.com/jira",
      "https://dev.example.com/jira": {
        "username": "joe.blow",
        "password": "secret"
      }
    }

Then use it:

    $ jirash
    ... help output ...
    $ jirash projects
    ...

