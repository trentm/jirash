# 2.x todo

- some remaining commands from 1.x

        jirash issue link ISSUE RELATION ISSUE
        jirash project list
        jirash project get PROJECT


# todo

- fix paging in `jirash issue ls FILTER`

- `jirash issue search` or some command to search issues. Perhaps have smart
  sugar for constructing jql.
        jirash search 'labels in (RFD-113)'   # jql
        jirash search label=RFD-113     # sugar
   Also jump to the search in the browser
        jirash search -b,--browse JQL

- handle error responses from the REST API of this form:
    https://docs.atlassian.com/jira/REST/7.4.2/#error-responses
  a current poor handling example:
    jirash issue create: error: {"errorMessages":[],"errors":{"name":"A version with this name already exists in this project."}}

- set user-agent on jiraClient

- `jirash issue links KEY`
    These are a combo of "remotelinks"
        https://docs.atlassian.com/software/jira/docs/api/REST/7.4.2/#api/2/issue-getRemoteIssueLinks
    and "issuelinks" field in "get issue".

# old todos

- add "jirash comment KEY", and -m option (or following args?) on resolve:
        jirash resolve FOO-123 because this is what I did
        jirash resolve FOO-123 -m "because this is what I did"
- tab complete for project names
- http caching and perhaps more aggresive (e.g. for project names and users)
- '--cc' field in `jirash createissue` to add watchers. Perhaps '-w', '--watch'.
- listing users
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
