# jirash Changelog

## 1.3.2

- [issue #16] Make the list of status names meaning "open" for `jirash issues -o` configurable
  via "open_status_names". See <https://github.com/trentm/jirash#configuration>.


## 1.3.1

- [issue #13] Align column headers in output of 'projects' and 'user' subcommands.
  By <https://github.com/jacques>.

- [issue #11] Prompt for user password if not in "~/.jirash.json" file. I.e.
  you don't have to save your password in a text file. By
  <https://github.com/jschauma>.

  TODO: Really should support <https://pypi.python.org/pypi/keyring>. Pull
  request (hint hint).


## 1.3.0

- [issue #8] Remove debugging 'XXX' left in from #6 work.
- [issue #6] Better error handling for running with a Python that doesn't
  have pyexpat installed (and only when needed for Jira SOAP API calls).
- '-o' flag to 'jirash issues' to include open tickets, but NOT just "Open". Also
  include "Reopened" and "In Progress".
- Fix case-insensitive searching of statuses in 'jirash issues -s ...'.


## 1.2.0

- `jirash issues ...` outputs with tighter representation to fit in console
  width. Use `-l, --long` for more fields and wider output.
- `jirash priorities`


## 1.1.0

- [issue #2] Hack to avoid UnicodeDecodeError in implicit str + unicode addition
  in Python 2.7's httplib.py.
- [issue #3] Add '-c COMPONENT' option to `jirash createissue`. Necessary because
  some projects require a component.
- [issue #1] Fix create issue with no given assignee
- `jirash resolve FOO-123` No support for setting the resolution (e.g. "Fixed"
  vs. "Won't Fix") because that's not possible via the Jira APIs.
- `jirash resolutions`
- Monkey-patch xmlrpclib to not bork on invalid UTF-8 XML response from Jira's
  XML-RPC API. Side-effect is that an invalid text field will have decode errors
  replaced with '?'.
- `jirash statuses`
- `jirash issues TERMS...`, `jirash issues -f FILTER`
- Bash completion of sub-command names:

        $ complete -C 'jirash --bash-completion' jirash    # setup bash completion
        $ jirash cre<TAB>    # completes to "jirash createissue"

- '-a|--assignee' optiotn to 'jirash createissue'
- `jirash filters`
- `jirash user USERNAME`


## 1.0.0

(first version)
