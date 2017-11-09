# 2.x todo

- ability to archive and release versions:
    jirash project versions PROJECT ?

    jirash version get ( ID | PROJECT NAME )
    jirash version list PROJECT
    jirash version archive ( ID | PROJECT NAME )
    jirash version release ( ID | PROJECT NAME )
    jirash version create ( ID | PROJECT NAME ) ...


# todo

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
