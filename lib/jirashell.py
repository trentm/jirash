#!/usr/bin/env python
#
# A Jira shell (using the Jira XML-RPC API).
#
# <https://confluence.atlassian.com/display/JIRA042/Creating+a+XML-RPC+Client>
# <http://docs.atlassian.com/software/jira/docs/api/rpc-jira-plugin/latest/com/atlassian/jira/rpc/xmlrpc/XmlRpcService.html>
#

__version__ = "1.0.0"

import os
import sys
import logging
from pprint import pprint
import json
import xmlrpclib
import time
import codecs
import operator
import webbrowser

import cmdln



#---- globals and config

log = logging.getLogger("jirash")



#---- exceptions

class JiraShellError(Exception):
    pass



#---- Jira API

class Jira(object):
    def __init__(self, jira_url, username, password):
        self.server = xmlrpclib.ServerProxy(jira_url + '/rpc/xmlrpc')
        self.auth = self.server.jira1.login(username, password)
        # WARNING: if we allow a longer jira shell session, then caching
        # might need invalidation.
        self.cache = {}

    def projects(self):
        if "projects" not in self.cache:
            projects = self.server.jira1.getProjectsNoSchemes(self.auth)
            projects = [p for p in projects if "Archived" not in p["name"]]
            projects.sort(key=operator.itemgetter("key"))
            self.cache["projects"] = projects
        return self.cache["projects"]

    def project(self, key):
        projects = self.projects()
        for p in projects:
            if p["key"] == key:
                return p
        else:
            raise JiraShellError("unknown project: %r" % key)

    def priorities(self):
        if "priorities" not in self.cache:
            priorities = self.server.jira1.getPriorities(self.auth)
            self.cache["priorities"] = priorities
        return self.cache["priorities"]

    def priority(self, priority_id):
        assert isinstance(priority_id, str)
        for p in self.priorities():
            if p["id"] == priority_id:
                return p
        else:
            raise JiraShellError("unknown priority: %r" % priority_id)

    def issue(self, key):
        return self.server.jira1.getIssue(self.auth, key)

    def issue_types(self, project_key=None):
        if project_key:
            project = self.project(project_key)
            issue_types = self.server.jira1.getIssueTypesForProject(
                self.auth, project["id"])
        else:
            if "issue_types" not in self.cache:
                self.cache["issue_types"] = self.server.jira1.getIssueTypes(self.auth)
            issue_types = self.cache["issue_types"]
        return issue_types

    def issue_type(self, issue_id):
        assert isinstance(issue_id, str)
        for t in self.issue_types():
            if t["id"] == issue_id:
                return t
        else:
            raise JiraShellError("unknown issue type: %r" % issue_id)

    def statuses(self):
        if "statuses" not in self.cache:
            self.cache["statuses"] = self.server.jira1.getStatuses(self.auth)
        return self.cache["statuses"]

    def status(self, status_id):
        assert isinstance(status_id, str)
        for s in self.statuses():
            if s["id"] == status_id:
                return s
        else:
            raise JiraShellError("unknown status: %r" % status_id)

    def create_issue(self, data):
        return self.server.jira1.createIssue(self.auth, data)


#---- JiraShell

class JiraShell(cmdln.Cmdln):
    name = "jirash"
    jira_url = None

    def get_optparser(self):
        parser = cmdln.Cmdln.get_optparser(self)
        parser.add_option("--version", action="store_true",
            help="show version and exit")
        parser.add_option("-d", "--debug", action="store_true",
            help="debug logging")
        parser.add_option("-J", "--jira-url", dest="jira_url",
            help="Jira base URL. Otherwise defaults to 'jira_url' value from config file.")
        return parser

    def _load_cfg(self, cfg_path=None):
        if not cfg_path:
            cfg_path = os.path.expanduser("~/.jirash.json")
        if not os.path.exists(cfg_path):
            sys.stderr.write("'%s' config file does not exist" % cfg_path)
            sys.exit(1)
        f = codecs.open(cfg_path, 'r', 'utf8')
        try:
            return json.load(f)
        finally:
            f.close()

    def postoptparse(self):
        if self.options.debug:
            log.setLevel(logging.DEBUG)
        if self.options.version:
            print "jirash %s" % __version__
            sys.exit(0)
        self.cfg = self._load_cfg()
        self.jira_url = self.options.jira_url or self.cfg["jira_url"]

    _jira_cache = None
    @property
    def jira(self):
        if not self._jira_cache:
            self._jira_cache = Jira(self.jira_url, self.cfg[self.jira_url]["username"],
                self.cfg[self.jira_url]["password"])
        return self._jira_cache

    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_projects(self, subcmd, opts):
        """List projects (excluding "Archived" projects).

        Usage:
            ${cmd_name}

        ${cmd_option_list}
        """
        projects = self.jira.projects()
        if opts.json:
            print json.dumps(projects, indent=2)
        else:
            template = "%-10s  %-32s  %s"
            print template % ("KEY", "NAME", "LEAD")
            for p in projects:
                print template % (p["key"], p["name"], p["lead"])

    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_issue(self, subcmd, opts, key):
        """Get an issue.

        Usage:
            ${cmd_name} KEY

        ${cmd_option_list}
        """
        issue = self.jira.issue(key)
        if opts.json:
            print json.dumps(issue, indent=2)
        else:
            print self._issue_repr(issue)

    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_issuetypes(self, subcmd, opts, *project_key):
        """Get an issue types (e.g. bug, task, ...).

        Usage:
            ${cmd_name} [PROJECT-KEY]

        ${cmd_option_list}
        """
        assert len(project_key) in (0,1)
        project_key = project_key and project_key[0] or None
        types = self.jira.issue_types(project_key)
        if opts.json:
            print json.dumps(types, indent=2)
        else:
            template = "%-2s  %-20s  %s"
            print template % ("ID", "NAME", "DESCRIPTION")
            for t in types:
                print template % (t["id"], t["name"], t["description"])

    #TODO: -t, --type option  (default to bug)
    #       createbug, createtask, ... aliases for this
    #TODO: -a, --assignee, allow "me"
    #TODO: -o to open the ticket
    #TODO: attachments?
    @cmdln.option("-d", "--description",
        help="issue description. If not given, this will prompt.")
    def do_createissue(self, subcmd, opts, project_key, *summary):
        """Create a new issue.

        Usage:
            ${cmd_name} PROJECT-KEY [SUMMARY]

        ${cmd_option_list}

        TODO:
        - type, default to 'bug'
        """
        data = {
            "project": project_key,
            "type": 1,   # Bug
        }
        if summary:
            summary = ' '.join(summary)
        else:
            summary = query("Summary")
        data["summary"] = summary
        if not opts.description:
            data["description"] = query_multiline("Description")
        else:
            data["description"] = opts.description
        issue = self.jira.create_issue(data)
        print "created:", self._issue_repr(issue)
        if True:
            url = "%s/browse/%s" % (self.jira_url, issue["key"])
            webbrowser.open(url)

    def _issue_repr(self, issue):
        try:
            issue_type = self.jira.issue_type(issue["type"])
            priority = self.jira.priority(issue["priority"])
            status = self.jira.status(issue["status"])
            return "%s: %s (%s -> %s, %s, %s, %s)" % (
                issue["key"],
                issue["summary"],
                issue["reporter"],
                issue.get("assignee", "<unassigned>"),
                issue_type["name"],
                priority["name"],
                status["name"])
        except Exception, e:
            log.error("error making issue repr: %s (issue=%r)", e, issue)
            raise






#---- support stuff

## {{{ http://code.activestate.com/recipes/577099/ (r1)
def query(question, default=None):
    s = question
    if default:
        s += " [%s]" % default
    s += ": "
    answer = raw_input(s)
    answer = answer.strip()
    if not answer:
        return default
    return answer
## end of http://code.activestate.com/recipes/577099/ }}}

def query_multiline(question):
    print "%s (use '.' on a line by itself to finish):" % question
    lines = []
    while True:
        line = raw_input()
        if line.rstrip() == '.':
            break
        lines.append(line.decode('utf-8'))
    answer = '\n'.join(lines)
    return answer



#---- mainline

def main(argv=sys.argv):
    logging.basicConfig(format='%(name)s: %(levelname)s: %(message)s')
    log.setLevel(logging.INFO)
    shell = JiraShell()
    return shell.main(argv)


## {{{ http://code.activestate.com/recipes/577258/ (r5)
if __name__ == "__main__":
    try:
        retval = main(sys.argv)
    except KeyboardInterrupt:
        sys.exit(1)
    except SystemExit:
        raise
    except:
        import traceback, logging
        if not log.handlers and not logging.root.handlers:
            logging.basicConfig()
        skip_it = False
        exc_info = sys.exc_info()
        if hasattr(exc_info[0], "__name__"):
            exc_class, exc, tb = exc_info
            if isinstance(exc, IOError) and exc.args[0] == 32:
                # Skip 'IOError: [Errno 32] Broken pipe': often a cancelling of `less`.
                skip_it = True
            if not skip_it:
                tb_path, tb_lineno, tb_func = traceback.extract_tb(tb)[-1][:3]
                log.error("%s (%s:%s in %s)", exc_info[1], tb_path,
                    tb_lineno, tb_func)
        else:  # string exception
            log.error(exc_info[0])
        if not skip_it:
            if log.isEnabledFor(logging.DEBUG):
                print()
                traceback.print_exception(*exc_info)
            sys.exit(1)
    else:
        sys.exit(retval)
## end of http://code.activestate.com/recipes/577258/ }}}
