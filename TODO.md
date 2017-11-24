# 2.x todo

- some remaining commands from 1.x

        jirash issue create ...
        jirash issue link ISSUE RELATION ISSUE
        jirash project list
        jirash project get PROJECT

- set user-agent on jiraClient

- to re-add to Configuration Reference
    - `open_status_names` Optional. A list of jira status *names* that correspond
      to the issue being "open". This is used for the "-o, --open" option to
      `jirash issues ...`.
    - `createissue_no_browse`. Optional. Set this to `true` to not open a newly
      created issue in the browser as part of `jirash createissue`. IOW, this is a
      substitute for the "-B, --no-browse" option.
    - `createissue_use_editor`. Optional. Set this to `true` to have `jirash
      createissue` use your $EDITOR to edit the issue summary (title) and
      description instead of prompting on stdin.


# todo

- handle error responses from the REST API of this form:
    https://docs.atlassian.com/jira/REST/7.4.2/#error-responses
  a current poor handling example:
    jirash issue create: error: {"errorMessages":[],"errors":{"name":"A version with this name already exists in this project."}}


# old todos

- add "jirash comment KEY", and -m option (or following args?) on resolve:
        jirash resolve FOO-123 because this is what I did
        jirash resolve FOO-123 -m "because this is what I did"
        jirash resolve FOO-123 -m -
        Comment ('.' to finish):
        because this is what I did
        .
  test ticket: TOOLS-158
- tab complete for project names
- http caching and perhaps more aggresive (e.g. for project names and users)
- '--cc' field in `jirash createissue` to add watchers. Perhaps '-w', '--watch'.
- search (Doesn't seem to be an XML-RPC API way to do anything
  but basic text searches though. I.e. can't *create* "filters".)
  Boo.
- listing users. Perhaps https://developer.atlassian.com/display/CROWDDEV/Crowd+REST+Resources#CrowdRESTResources-SearchResource
- updateIssue commands
- adding a comment:
    $ jirash comment MON-113 blah bah blah
    $ jirash comment MON-113
    blah blah
    blah
    .
- `jirash dup(licate) MON-113 of MON-114`  Yes, a literal "of" to try to
  help make clear which is the dupe. Doesn't read quite right:

        jirash dup MON-113 --of MON-114
        jirash dep MON-113 --of MON-114

  or:

        jirash resolve FOO-123 --duplicates FOO-32

# someday/maybe

- setting a current ticket. Would this be useful? Or too weird. Prior art?
    $ jirash cd MON-113   # persist? Perhaps just in current env? Then need a bash function driver.
    $ jirash comment
    blah blah
    .
