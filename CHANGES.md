# jirash Changelog

## not yet released

- `jirash issues -S,--short ...` option to just show key and full summary,
  because the clipped summary from default columns is a bit annoying.

## 2.2.0

- Add `jirash issue create ...` (`jirash create ...` as a shortcut).
- Fix `jirash issue ls FILTER` *case-senstive* matching of FILTER against
  filter names.
- `jirash issues FILTER` shortcut for `jirash issue ls FILTER`.
- Add hidden `jirash api ...` for doing raw JIRA REST API requests. This is
  mainly helpful for jirash development.

## 2.1.1

- Fix "Cannot find module 'VError'" errors.

## 2.1.0

- Add `jirash version update PROJECT VERSION FIELD=VALUE ...`.
- Add `jirash version create PROJECT VERSION-NAME`.
- Improve `jirash issue ls FILTER` matching of the "FILTER" term to full filter
  names: try case-sensitive whole word match to help disambiguate, add a
  any-substring match attempt.

## 2.0.1

- Install `jirash` bin in `npm install`.

## 2.0.0

- jirash 2.x. This is a re-write to use the JIRA REST API. I'll also re-write in
  node.js because that'll be easier for me and avoids a problem with the default
  Mac Python 2.7 (/usr/bin/python on macOS 10.12) that uses an old OpenSSL 0.9.8
  that doesn't support the TLS version required by, at least my company's,
  latest JIRA version.

  Some commands will be dropped, some added, and some changed.
  A quick survey at work showed the following are used:
    - `jirash issue` -> `jirash issue get KEY`, `jirash KEY`.
    - `jirash issues -f FILTER` -> `jirash issue list FILTER`
    - `jirash createissue` -> `jirash issue create` (TODO)
    - `jirash link KEY-1 RELATION KEY-2`,
      e.g. `jirash link KEY-1 duplicates KEY-2` (TODO)
    - `jirash version list PROJ`,
      `jirash version archive PROJ NAME`,
      `jirash version release PROJ NAME`


## 1.8.0

- `jirash issue -s,--short KEY` Add the short option to display a short
  issue summary: `$key $title`. This is a somewhat biased "short" form
  that is used at Joyent for commit messages.

## 1.7.0

- Change the one-line ("flat") string representation of an issue to no longer
  have the colon separating the ID and the ticket title. E.g.:

      # old
      $ jirash DOCKER-404
      DOCKER-404: when provision fails we should return only req_id and not VM info (josh -> josh, Bug, Normal, Resolved)

      # new
      $ jirash DOCKER-404
      DOCKER-404 when provision fails we should return only req_id and not VM info (josh -> josh, Bug, Normal, Resolved)

  This is motivated by
  <https://github.com/joyent/eng/blob/master/docs/index.md#commit-comments>.

## 1.6.1

- `jirash createissue ...` intended to default to not passing an assignee, i.e.
  use the defualt for the project. However, accidentally, when using the editor
  to create the issue data, it defaulted to 'me'. I don't want that.

## 1.6.0

- [issue #24] `jirash createissue` improvements around editing the
  summary/description in your editor:
    - `jirash createissue -e ...` to explicitly use editor
    - `jirash createissue -E file ...` to also specify a template file
    - If the issue creation fails the editted file will be saved out so
      you don't lose your changes. The following is printed in that case:

            $ jirash createissue VMAPI
            Note: Your edits have been saved to VMAPI-NNN.1431114917.jirash, reload with:
                jirash createissue -E VMAPI-NNN.1431114917.jirash ...

            Traceback (most recent call last):
              File "/Users/trentm/tm/jirash/lib/jirashell.py", line 1294, in <module>
            ...


## 1.5.0

- Add support for `"createissue_use_editor": true` in "~/.jirash.json" config
  which will change `jirash createissue PROJECT ...` to open your `$EDITOR`
  to edit the issue `summary` and `description`.

## 1.4.0

- Update `jirash issues -f FILTER` handling of FILTER to prefer a *full word*
  match against existing filter names. E.g. A filter of "OPS" would prefer
  the filter named "OPS: open issues" over "DCOPS: open issues".

- TOOLS-525: `jirash createissue -t TYPE` to specify issue type


## 1.3.2

- `jirash link <issue> <relation-from-linktypes> <issue>`, e.g.
  `jirash link PROJ-123 depends on PROJ-101`, to link issues.

- `jirash linktypes` to list issue link types.

- [issue #10] "createissue_no_browse" config var to skip opening newly created
  issues in the browser.

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
