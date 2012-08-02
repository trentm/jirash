# todo

- resolve a ticket (need to figure out custom fields, e.g. Fixed in Version/s???):
  Attempt to use this to change the status:
    http://docs.atlassian.com/software/jira/docs/api/rpc-jira-plugin/latest/com/atlassian/jira/rpc/soap/JiraSoapService.html#progressWorkflowAction%28java.lang.String,%20java.lang.String,%20java.lang.String,%20com.atlassian.jira.rpc.soap.beans.RemoteFieldValue[]%29
  per comment at:
    http://old.nabble.com/-JIRA-user--changing-status,-resolution-via-xmlrpc-%28Perl%29-td4973454.html
- tab complete for project names
- http caching and perhaps more aggresive (e.g. for project names and users)
- add '-c component' to createissue
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

        jirash resolve FOO-123 --duplicates FOO-32   # using the language from http://cl.ly/image/401X1R0u0741

# someday/maybe

- setting a current ticket. Would this be useful? Or too weird. Prior art?
    $ jirash cd MON-113   # persist? Perhaps just in current env? Then need a bash function driver.
    $ jirash comment
    blah blah
    .

- moar from http://docs.atlassian.com/software/jira/docs/api/rpc-jira-plugin/latest/com/atlassian/jira/rpc/xmlrpc/XmlRpcService.html ?
