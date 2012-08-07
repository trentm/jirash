# jirash Changelog

# 1.1.0

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


# 1.0.0

(first version)
