- tab complete for commands
- tab complete for project names
- http caching and perhap more aggresive (e.g. for project names)
- add '-c component' to createissue
- add '-a assignee' to createissue. Harder to get usernames. What is
  assignee field in this?
  http://docs.atlassian.com/software/jira/docs/api/rpc-jira-plugin/latest/com/atlassian/jira/rpc/soap/beans/RemoteIssue.html
- search (Doesn't seem to be an XML-RPC API way to do anything
  but basic text searches though. I.e. can't *create* "filters".)
  Boo.
- updateIssue commands
- adding a comment: 
    $ jirash comment MON-113 blah bah blah
    $ jirash comment MON-113
    blah blah
    blah
    .

# someday/maybe

- setting a current ticket. Would this be useful? Or too weird. Prior art?
    $ jirash cd MON-113   # persist? Perhaps just in current env? Then need a bash function driver.
    $ jirash comment
    blah blah
    .

- moar from http://docs.atlassian.com/software/jira/docs/api/rpc-jira-plugin/latest/com/atlassian/jira/rpc/xmlrpc/XmlRpcService.html ?
