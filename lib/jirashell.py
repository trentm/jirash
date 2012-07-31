#!/usr/bin/env python
#
# A Jira shell (using the Jira XML-RPC API).
#
# <https://confluence.atlassian.com/display/JIRA042/Creating+a+XML-RPC+Client>
# <http://docs.atlassian.com/software/jira/docs/api/rpc-jira-plugin/latest/com/atlassian/jira/rpc/xmlrpc/XmlRpcService.html>
#

__version__ = "1.1.0"

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
import re

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

    def filters(self):
        if "filters" not in self.cache:
            filters = self.server.jira1.getFavouriteFilters(self.auth)
            projects.sort(key=operator.itemgetter("name"))
            self.cache["filters"] = filters
        return self.cache["filters"]

    def user(self, username):
        return self.server.jira1.getUser(self.auth, username)

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

    def components(self, project_key):
        components = self.server.jira1.getComponents(self.auth, project_key)
        components.sort(key=operator.itemgetter("name"))
        return components

    def component(self, project_key, component_id):
        assert isinstance(component_id, str)
        for c in self.components(project_key):
            if c["id"] == component_id:
                return c
        else:
            raise JiraShellError("unknown component id: %r" % component_id)

    def versions(self, project_key, exclude_archived=None,
            exclude_released=None):
        versions = self.server.jira1.getVersions(self.auth, project_key)
        if exclude_archived:
            versions = [v for v in versions if v["archived"] != "true"]
        if exclude_released:
            versions = [v for v in versions if v["released"] != "true"]
        versions.sort(key=lambda v: int(v["sequence"]))
        return versions

    def version(self, version_id):
        assert isinstance(version_id, str)
        for v in self.versions():
            if v["id"] == version_id:
                return v
        else:
            raise JiraShellError("unknown version: %r" % version_id)

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
    def do_filters(self, subcmd, opts):
        """List "favourite" filters for the current user.

        Usage:
            ${cmd_name}

        ${cmd_option_list}
        """
        filters = self.jira.filters()
        if opts.json:
            print json.dumps(filters, indent=2)
        else:
            template = "%-5s  %-15s  %s"
            print template % ("ID", "AUTHOR", "NAME")
            for f in filters:
                print template % (f["id"], f["author"], f["name"])

    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_user(self, subcmd, opts, username):
        """List a given user's information.

        Usage:
            ${cmd_name}

        ${cmd_option_list}
        """
        user = self.jira.user(username)
        if not user:
            log.error("no such user: %r", username)
            return 1
        elif opts.json:
            print json.dumps(user, indent=2)
        else:
            template = "%-15s  %-20s  %s"
            print template % ("NAME", "FULLNAME", "EMAIL")
            print template % (user["name"], user["fullname"], user["email"])


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

    def default(self, argv):
        key_re = re.compile(r'^\b[A-Z]+\b-\d+$')
        if key_re.search(argv[0]):
            return self.onecmd(['issue'] + argv)
        return cmdln.Cmdln.default(self, argv)

    #TODO
    #def completedefault(self, text, line, begidx, endidx):
    #    # Complete paths in the cwd.
    #    start = line[begidx:endidx]
    #    parent = udirname(start)
    #    res, dirents = _manta_getdir(self._get_manta_url(parent))
    #    matches = [m for m in dirents.keys() if m.startswith(start)]
    #    return matches

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

    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    @cmdln.option("-a", dest="exclude_archived", action="store_true",
        help="exclude archived versions")
    @cmdln.option("-r", dest="exclude_released", action="store_true",
        help="exclude released versions")
    def do_versions(self, subcmd, opts, project_key):
        """Get available versions for the given project.

        Usage:
            ${cmd_name} PROJECT-KEY

        ${cmd_option_list}
        """
        versions = self.jira.versions(project_key,
            exclude_archived=opts.exclude_archived,
            exclude_released=opts.exclude_released)
        if opts.json:
            print json.dumps(versions, indent=2)
        else:
            template = "%-5s  %-22s  %8s  %8s"
            print template % ("ID", "NAME", "RELEASED", "ARCHIVED")
            for v in versions:
                print template % (
                    v["id"],
                    v["name"],
                    (v["released"] == "true" and "released" or "-"),
                    (v["archived"] == "true" and "archived" or "-"))

    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_components(self, subcmd, opts, project_key):
        """Get available components for the given project.

        Usage:
            ${cmd_name} PROJECT-KEY

        ${cmd_option_list}
        """
        components = self.jira.components(project_key)
        if opts.json:
            print json.dumps(components, indent=2)
        else:
            template = "%-5s  %s"
            print template % ("ID", "NAME")
            for c in components:
                print template % (c["id"], c["name"])

    #TODO: -t, --type option  (default to bug)
    #       createbug, createtask, ... aliases for this
    #TODO: --browse to open the ticket
    #TODO: attachments?
    @cmdln.option("-d", "--description",
        help="issue description. If not given, this will prompt.")
    @cmdln.option("-a", "--assignee",
        help="Assignee username. (XXX Don't have a good way to list available usernames right now.)")
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

        if not opts.assignee:
            data["assignee"] = query(
                "Assignee (blank for default, 'me' for yourself)")
        else:
            data["assignee"] = opts.assignee
        if data["assignee"] == "me":
            data["assignee"] = self.cfg[self.jira_url]["username"]

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
    return shell.main(argv, loop=cmdln.LOOP_IF_EMPTY)


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
