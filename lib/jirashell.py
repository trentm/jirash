#!/usr/bin/env python
# -*- coding: utf8 -*-
#
# A Jira shell (using the Jira XML-RPC API).
#
# <https://confluence.atlassian.com/display/JIRA042/Creating+a+XML-RPC+Client>
# <http://docs.atlassian.com/software/jira/docs/api/rpc-jira-plugin/latest/com/atlassian/jira/rpc/xmlrpc/XmlRpcService.html>
#

__version__ = "1.3.2"

import warnings
warnings.filterwarnings("ignore", module="wstools.XMLSchema", lineno=3107)
# Ignore this:
#   /opt/local/lib/python2.6/xmlrpclib.py:612: DeprecationWarning: The xmllib module is obsolete.
warnings.filterwarnings("ignore", module="xmlrpclib", lineno=612)

import getpass
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

TOP = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
sys.path.insert(0, os.path.join(TOP, "deps"))
import cmdln

# This is a total hack for <https://github.com/trentm/jirash/issues/2>.
# It ensures that utf-8 is used for implicit string conversion deep
# in httplib.py for Python 2.7 (which changed from 2.6 resulting in
# that conversion).
if sys.version_info >= (2, 7):
    reload(sys)
    sys.setdefaultencoding('utf-8')



#---- globals and config

log = logging.getLogger("jirash")



#---- exceptions

class JiraShellError(Exception):
    pass

class JiraShellUsageError(JiraShellError):
    pass



#---- monkey-patching

def _decode(data, encoding, is8bit=re.compile("[\x80-\xff]").search):
    # decode non-ascii string (if possible)
    if unicode and encoding and is8bit(data):
        data = unicode(data, encoding, 'replace')
    return data
xmlrpclib._decode = _decode

def _isint(s):
    try:
        int(s)
    except ValueError:
        return False
    else:
        return True



#---- Jira API

class Jira(object):
    def __init__(self, jira_url, username, password):
        self.jira_url = jira_url
        self.username = username
        self.password = password
        self.server = xmlrpclib.ServerProxy(jira_url + '/rpc/xmlrpc',
            verbose=False)
        self.auth = self.server.jira1.login(username, password)
        # WARNING: if we allow a longer jira shell session, then caching
        # might need invalidation.
        self.cache = {}

    _soap_server = None
    _soap_auth = None
    def _get_soap_server(self):
        try:
            import pyexpat
        except ImportError:
            msg = ("Your Python (%s) doesn't have the 'pyexpat' module "
                "needed to call the Jira SOAP API. You must install that "
                "and retry." % sys.executable)
            how = howto_install_pyexpat()
            if how:
                msg += " You could try `%s`." % how
            raise JiraShellUsageError(msg)
        import SOAPpy
        from StringIO import StringIO
        if not self._soap_server:
            soap_url = self.jira_url + '/rpc/soap/jirasoapservice-v2?wsdl'
            try:
                oldStdout = sys.stdout
                sys.stdout = StringIO()   # trap log output from WSDL parsing
                self._soap_server = SOAPpy.WSDL.Proxy(soap_url)
            finally:
                sys.stdout = oldStdout
            self._soap_auth = self._soap_server.login(
                self.username, self.password)
        return self._soap_server, self._soap_auth

    def _jira_soap_call(self, methodName, args):
        server, auth = self._get_soap_server()
        authedArgs = [auth] + args
        out = getattr(server, methodName)(*authedArgs)
        typeName = out._typeName()
        if typeName == "struct":
            return out._asdict()
        elif typeName == "typedArray":
            outList = [item._asdict() for item in out._aslist()]
            return outList
        else:
            raise JiraShellError("unknown SOAPpy outparam type: '%s'" % typeName)

    def filters(self):
        if "filters" not in self.cache:
            filters = self.server.jira1.getFavouriteFilters(self.auth)
            filters.sort(key=operator.itemgetter("name"))
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

    def issues_from_filter(self, filter):
        """Return all issues for the given filter.

        @param filter {String} Filter (saved search) to use. The given
            argument can be the filter id, name, or a unique substring or
            multi-term substring (e.g. 'foo bar' would match 'Filter foo
            and bar') of the name.
        """
        # Find the filter.
        filterObj = None
        filters = self.filters()
        # - if int, then try id match first
        if _isint(filter):
            filter = int(filter)
            for f in filters:
                if int(f["id"]) == filter:
                    filterObj = f
                    break
            else:
                raise JiraShellError("no filter with id %r" % filter)
        if not filterObj:
            # - try full name match
            for f in filters:
                if f["name"] == filter:
                    filterObj = f
                    break
        if not filterObj:
            # - try substring match
            for f in filters:
                if filter in f["name"]:
                    filterObj = f
                    break
        if not filterObj and len(filter.split()) > 1:
            # - try multi-term substring match
            terms = filter.strip().split()
            for f in filters:
                found_terms = [t for t in terms if t in f["name"]]
                if len(found_terms) == len(terms):
                    filterObj = f
                    break
        if not filterObj:
            raise JiraShellError("no filter found matching %r" % filter)
        log.debug("filter match for %r: %s", filter, json.dumps(filterObj))
        return self.server.jira1.getIssuesFromFilter(self.auth, filterObj["id"])

    def issues_from_search(self, terms, project_keys=None):
        """Search for issues.

        @param terms {str} A single stream of search term(s).
        @param project_keys {list} Optional list of project keys to which to
            limit the search.
        """
        if isinstance(terms, (list, tuple)):
            terms = ' '.join(terms)
        if not project_keys:
            #XXX
            # TODO: This errors out against my Jira 4.2:
            #   jirash: ERROR: <Fault 0: 'java.lang.NoSuchMethodException: com.atlassian.jira.rpc.xmlrpc.JiraXmlRpcService.getIssuesFromTextSearch(java.lang.String, java.util.Vector)'> (/Library/Frameworks/Python.framework/Versions/2.6/lib/python2.6/xmlrpclib.py:838 in close)
            # but this says it should exist:
            #   http://docs.atlassian.com/software/jira/docs/api/rpc-jira-plugin/4.2/index.html?com/atlassian/jira/rpc/xmlrpc/XmlRpcService.html
            issues = self.server.jira1.getIssuesFromTextSearch(self.auth, terms)
        else:
            # Note: I don't want to bother with `maxNumResults` so we set
            # it to a big number.
            BIG = 1000000
            issues = self.server.jira1.getIssuesFromTextSearchWithProject(
                self.auth, project_keys, terms, BIG)
            if len(issues) == BIG:
                log.warn("*%s* matches returned for %r (projects %s), "
                    "the result might not include a matches",
                    BIG, terms, ', '.join(project_keys))
        return issues


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
        if "components" not in self.cache:
            self.cache["components"] = {}
        if project_key not in self.cache["components"]:
            components = self.server.jira1.getComponents(self.auth, project_key)
            components.sort(key=operator.itemgetter("name"))
            self.cache["components"][project_key] = components
        return self.cache["components"][project_key]

    def component(self, project_key, component_id):
        assert isinstance(component_id, str)
        for c in self.components(project_key):
            if c["id"] == component_id:
                return c
        else:
            raise JiraShellError("unknown component id: %r" % component_id)

    def component_id(self, project_key, name):
        """Return the project component id from the given id, name, or unique
        substring match on the name.
        """
        componentObj = None
        components = self.components(project_key)
        name_lower = name.lower()
        # - if int, then try id match first
        if isinstance(name, int):
            for r in components:
                if int(r["id"]) == name:
                    componentObj = r
                    break
            else:
                raise JiraShellError("no component with id %r" % name)
        if not componentObj:
            # - try full name match
            for r in components:
                if r["name"].lower() == name_lower:
                    componentObj = r
                    break
        if not componentObj:
            # - try substring match
            matches = [r for r in components
                if name_lower in r["name"].lower()]
            if len(matches) == 1:
                componentObj = matches[0]
            elif len(matches) > 1:
                raise JiraShellError(
                    "'%s' is ambiguous: matching components: \"%s\"" % (
                    name, '", "'.join([r["name"] for r in matches])))
        if not componentObj:
            raise JiraShellError("no component found matching %r" % name)
        return componentObj["id"]

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

    def resolutions(self):
        if "resolutions" not in self.cache:
            self.cache["resolutions"] = self.server.jira1.getResolutions(self.auth)
        return self.cache["resolutions"]

    def resolution_id(self, name):
        """Return the resolution id from the given id, name, or unique
        substring match on the name.
        """
        resolutionObj = None
        resolutions = self.resolutions()
        name_lower = name.lower()
        # - if int, then try id match first
        if isinstance(name, int):
            for r in resolutions:
                if int(r["id"]) == name:
                    resolutionObj = r
                    break
            else:
                raise JiraShellError("no resolution with id %r" % name)
        if not resolutionObj:
            # - try full name match
            for r in resolutions:
                if r["name"].lower() == name_lower:
                    resolutionObj = r
                    break
        if not resolutionObj:
            # - try substring match
            matches = [r for r in resolutions
                if name_lower in r["name"].lower()]
            if len(matches) == 1:
                resolutionObj = matches[0]
            elif len(matches) > 1:
                raise JiraShellError(
                    "'%s' is ambiguous: matching resolutions: \"%s\"" % (
                    name, '", "'.join([r["name"] for r in matches])))
        if not resolutionObj:
            raise JiraShellError("no resolution found matching %r" % name)
        return resolutionObj["id"]

    def resolve(self, key):
        """Resolve the given issue.

        TODO: what is the result when the workflow change is illegal?
        """
        # 5 === "Resolved". Is that true for all Jiras?
        res = self._jira_soap_call("progressWorkflowAction", [key, "5"])

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

    def status_id(self, name):
        """Get the id of the status matching the given name.

        @param name {str} Case-insensitive status name.
        """
        statuses = self.statuses()
        name_lower = name.lower()
        for s in statuses:
            if name_lower == s["name"].lower():
                return s["id"]
        else:
            raise JiraShellError("unknown status name: %r" % name)

    def create_issue(self, data):
        return self.server.jira1.createIssue(self.auth, data)

    def update_issue(self, key, data):
        # Actual helpful docs on updateIssue():
        # https://jira.atlassian.com/browse/JRA-10588
        if log.isEnabledFor(logging.DEBUG):
            log.debug("calling updateIssue(%r, %s)", key, json.dumps(data))
        return self.server.jira1.updateIssue(self.auth, key, data)


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

    def _generate_cfg(self, cfg_path):
        url      = raw_input("Jira URL: ")
        username = raw_input("Username: ")
        password = getpass.getpass("Password: ")

        # TODO Attempt login to validate before saving
        config = {
            'jira_url': url,
            url: {
                'username': username,
                'password': password,
            },
        }

        f = codecs.open(cfg_path, 'w', 'utf8')
        f.write(json.dumps(config, indent=2))
        f.close()

    def _load_cfg(self, cfg_path=None):
        if not cfg_path:
            cfg_path = os.path.expanduser("~/.jirash.json")
        if not os.path.exists(cfg_path):
            print "This appears to be your first time running jirash, let me generate your config"
            if self._generate_cfg(cfg_path):
                print "Config file generated! [%s]" % cfg_path
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
        if not self.cfg[self.jira_url].has_key("password"):
            prompt = "Jira (%s) password: " % self.jira_url
            self.cfg[self.jira_url]["password"] = getpass.getpass(prompt)

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
                print template % (
                    clip(p["key"], 10),
                    clip(p["name"], 32),
                    p["lead"]
                )

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
    def do_priorities(self, subcmd, opts):
        """List all issue priorities.

        Usage:
            ${cmd_name}

        ${cmd_option_list}
        """
        priorities = self.jira.priorities()
        if opts.json:
            print json.dumps(priorities, indent=2)
        else:
            template = "%-3s  %-8s  %s"
            print template % ("ID", "NAME", "DESCRIPTION")
            for p in priorities:
                print template % (p["id"], p["name"], p["description"])

    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_statuses(self, subcmd, opts):
        """List all possible issue statuses.

        Usage:
            ${cmd_name}

        ${cmd_option_list}
        """
        statuses = self.jira.statuses()
        if opts.json:
            print json.dumps(statuses, indent=2)
        else:
            template = "%-5s  %-15s  %s"
            print template % ("ID", "NAME", "DESCRIPTION")
            for s in statuses:
                print template % (s["id"], s["name"], s["description"])

    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_resolutions(self, subcmd, opts):
        """List all possible issue resolutions.

        Usage:
            ${cmd_name}

        ${cmd_option_list}
        """
        resolutions = self.jira.resolutions()
        if opts.json:
            print json.dumps(resolutions, indent=2)
        else:
            template = "%-5s  %-16s  %s"
            print template % ("ID", "NAME", "DESCRIPTION")
            for r in resolutions:
                print template % (r["id"], r["name"], r["description"])

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
            template = "%-20s  %-20s  %s"
            print template % ("NAME", "FULLNAME", "EMAIL")
            print template % (
                clip(user["name"], 20),
                clip(user["fullname"], 20),
                user["email"])

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
            print self._issue_repr_flat(issue)

    @cmdln.option("-f", "--filter",
        help="Filter (saved search) to use. See `jirash filters`. The given "
            "argument can be the filter id, name, or a unique substring or "
            "multi-term substring (e.g. 'foo bar' would match 'Filter foo "
            "and bar') of the name.")
    @cmdln.option("-s", "--status", action="append", dest="statuses",
        help="Limit to issues with the given status string, e.g. 'open'. "
            "Can be specified multiple times.")
    @cmdln.option("-o", "--open", action="store_true",
        help="Limit to open issues, where open here is a shortcut for "
            "`-s 'Open' -s 'In Progress' -s 'Reopened'`. Note: Use the "
            "'open_status_names' config var to configure the names of 'open'"
            "statuses.")
    @cmdln.option("-p", "--project", action="append", dest="project_keys",
        help="Project key(s) to which to limit a text search")
    @cmdln.option("-l", "--long", action="store_true", help="Long output")
    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_issues(self, subcmd, opts, *terms):
        """List issues from a filter (saved search) or text search.

        By default not all data on each ticket is displayed to try to
        keep the width of the table small. Use '-l' for more data. Use
        '-j' for all data.

        Usage:
            ${cmd_name} TERMS...
            ${cmd_name} -f FILTER

        ${cmd_option_list}
        """
        if opts.filter:
            # Ignore 'terms' with a filter for now. TODO: subsearch
            if opts.project_keys:
                log.warn("ignoring project scoping for a *filter* search: '%s'",
                    "', '".join(opts.project_keys))
            if terms:
                log.warn("ignoring search terms for a *filter* search: '%s'",
                    "', '".join(terms))
            try:
                issues = self.jira.issues_from_filter(opts.filter)
            except JiraShellError, e:
                log.error(e)
                return 1
        elif not terms:
            log.error("no search terms given")
            return 1
        else:
            # TODO: Consider separate search for each term and merge results
            # if that is more useful.
            term = ' '.join(terms)
            issues = self.jira.issues_from_search(terms,
                project_keys=opts.project_keys)

        status_ids = []
        if opts.statuses:
            status_ids += [self.jira.status_id(name) for name in opts.statuses]
        if opts.open:
            open_status_names = self.cfg.get('open_status_names',
                ["Open", "In Progress", "Reopened"])
            status_ids = [] # TODO: cache these
            for name in open_status_names:
                try:
                    status_ids.append(self.jira.status_id(name))
                except JiraShellError, e:
                    log.warn(e)
        if status_ids:
            issues = [i for i in issues if i["status"] in status_ids]

        if opts.json:
            print json.dumps(issues, indent=2)
        else:
            self._print_issue_table(issues, long_format=opts.long)

    def default(self, argv):
        key_re = re.compile(r'^\b[A-Z]+\b-\d+$')
        if key_re.search(argv[0]):
            return self.onecmd(['issue'] + argv)
        return cmdln.Cmdln.default(self, argv)

    #TODO
    #def completedefault(self, text, line, begidx, endidx):
    #    # Complete paths in the cwd.
    #    start = line[begidx:endidx]
    #    print "XXX %r %r %r" % (test, line, start)
    #    return []

    @cmdln.option("-p", "--project", dest="project_key",
        help="Project for which to get issue types.")
    @cmdln.option("-j", "--json", action="store_true", help="JSON output")
    def do_issuetypes(self, subcmd, opts):
        """Get an issue types (e.g. bug, task, ...).

        Usage:
            ${cmd_name}

        ${cmd_option_list}
        """
        types = self.jira.issue_types(opts.project_key)
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
            template = "%-5s  %-24s  %8s  %8s"
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
        help="Assignee username. Note that this is the username field, NOT their full name. (XXX Don't have a good way to list available usernames right now.)")
    @cmdln.option("-c", "--component", dest="components", action="append",
        metavar="COMPONENT",
        help="Component id or substring match. Use `jirash components PROJ` to list them. Some Jira projects require a component and don't have a default, but jirash can't detect that so doesn't know when to require a component.")
    @cmdln.option("-B", "--no-browse", action="store_true",
        help="Do *not* attempt to open the browser to the created issue.")
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
            summary = u' '.join(summary)
            print u"Summary: %s" % summary
        else:
            summary = query("Summary")
        data["summary"] = summary.encode('utf-8')

        if not opts.assignee:
            assignee = query(
                "Assignee (blank for default, 'me' for yourself)")
        else:
            assignee = opts.assignee
        if assignee:
            if assignee == "me":
                data["assignee"] = self.cfg[self.jira_url]["username"]
            else:
                data["assignee"] = assignee

        if opts.components:
            component_ids = [self.jira.component_id(project_key, s)
                for s in opts.components]
            data["components"] = [{"id": cid} for cid in component_ids]
            print "Components: %s" % ', '.join(
                self.jira.component(project_key, cid)["name"]
                for cid in component_ids)

        if not opts.description:
            description = query_multiline("Description")
        else:
            description = opts.description
        data["description"] = description.encode('utf-8')

        issue = self.jira.create_issue(data)
        print "created:", self._issue_repr_flat(issue)
        no_browse = (opts.no_browse
            or self.cfg.get("createissue_no_browse", False))
        if not no_browse:
            url = "%s/browse/%s" % (self.jira_url, issue["key"])
            webbrowser.open(url)

    def _do_soap(self, subcmd, opts):
        res = self.jira._jira_soap_call("getIssue", ["MON-113"])
        #res = self.jira._jira_soap_call("progressWorkflowAction",
        #    ["TOOLS-158", "5"])   # 5 === "Resolved"
        pprint(res)

    #@cmdln.option("-r", "--resolution",
    #    help="Resolution. Default is 'fixed'. See `jira resolutions`. The "
    #        "given value can be a resolution id, name or unique name "
    #        "substring.")
    def do_resolve(self, subcmd, opts, key):
        """Resolve an issue.

        Limitation: AFAICT there is no way to *set* to resolution (i.e.
        "Fixed" vs "Won't Fix" ... `jirash resolutions`) via the Jira API,
        so there is no option for that here.

        Usage:
            ${cmd_name} ISSUE-KEY

        ${cmd_option_list}
        """
        self.jira.resolve(key)
        issue = self.jira.issue(key)
        print "updated:", self._issue_repr_flat(issue)

    def _print_issue_table(self, issues, long_format=False):
        if long_format:
            template = "%-11s  %-8s  %-8s  %-11s  %-10s  %-10s  %s"
            columns = ("KEY", "PRIO", "STATUS", "TYPE", "REPORTER",
                "ASSIGNEE", "SUMMARY")
            print template % columns
            for issue in issues:
                try:
                    try:
                        issue_type = self.jira.issue_type(issue["type"])["name"]
                    except JiraShellError, e:
                        # The issue type may have been removed. Just use the id.
                        issue_type = issue["type"]
                    priority = self.jira.priority(issue["priority"])
                    status = self.jira.status(issue["status"])
                    print template % (
                        issue["key"],
                        priority["name"],
                        clip(status["name"], 8),
                        clip(issue_type, 11),
                        clip(issue["reporter"], 10),
                        clip(issue.get("assignee", "unassigned"), 10),
                        issue["summary"],
                    )
                except Exception, e:
                    log.error("error making issue repr: %s (issue=%r)",
                        e, issue)
                    raise
        else:
            if issues:
                key_width = max(len(i["key"]) for i in issues)
                template = u"%%-%ds  %%-13s  %%-10s  %%s" % key_width
                term_width = getTerminalSize()[1]
                summary_width = term_width - key_width - 2 - 13 - 2 - 10 - 2
                columns = ("KEY", "STATE", "ASSIGNEE", "SUMMARY")
                print template % columns
            for issue in issues:
                try:
                    try:
                        issue_type = self.jira.issue_type(issue["type"])["name"]
                    except JiraShellError, e:
                        # The issue type may have been removed. Just use the id.
                        issue_type = issue["type"]
                    priority = self.jira.priority(issue["priority"])
                    status = self.jira.status(issue["status"])
                    state = "%s/%s/%s" % (
                        clip(priority["name"], 4, False),
                        clip(status["name"].replace(' ', ''), 4, False),
                        clip(issue_type, 3, False))
                    safeprint(template % (
                        issue["key"],
                        state,
                        clip(issue.get("assignee", "unassigned"), 10),
                        #issue["summary"],
                        clip(issue["summary"], summary_width),
                    ))
                except Exception, e:
                    log.error("error making issue repr: %s (issue=%r)",
                        e, issue)
                    raise

    def _issue_repr_flat(self, issue):
        try:
            try:
                issue_type = self.jira.issue_type(issue["type"])["name"]
            except JiraShellError, e:
                # The issue type may have been removed. Just use the id.
                issue_type = "type:" + issue["type"]
            priority = self.jira.priority(issue["priority"])
            status = self.jira.status(issue["status"])
            return "%s: %s (%s -> %s, %s, %s, %s)" % (
                issue["key"],
                issue["summary"],
                issue["reporter"],
                issue.get("assignee", "<unassigned>"),
                issue_type,
                priority["name"],
                status["name"])
        except Exception, e:
            log.error("error making issue repr: %s (issue=%r)", e, issue)
            raise



#---- support stuff

def howto_install_pyexpat():
    """Return a short suggestion string for installing pyexpat on
    the current OS. Or None if no suggestion.
    """
    pyver = "%d.%d" % tuple(sys.version_info[0:2])
    if sys.platform.startswith("sunos"):
        if os.path.exists("/opt/local/etc/pkg_install.conf"):
            return "pkgin -y py%s-expat" % pyver


# http://stackoverflow.com/questions/566746/how-to-get-console-window-width-in-python
# with a tweak.
def getTerminalSize():
    import os
    env = os.environ
    def ioctl_GWINSZ(fd):
        try:
            import fcntl, termios, struct, os
            cr = struct.unpack('hh', fcntl.ioctl(fd, termios.TIOCGWINSZ, '1234'))
        except:
            return None
        return cr[1], cr[0]
    cr = ioctl_GWINSZ(0) or ioctl_GWINSZ(1) or ioctl_GWINSZ(2)
    if not cr:
        try:
            fd = os.open(os.ctermid(), os.O_RDONLY)
            cr = ioctl_GWINSZ(fd)
            os.close(fd)
        except:
            pass
    if not cr:
        try:
            cr = (env['LINES'], env['COLUMNS'])
        except:
            cr = (25, 80)
    return int(cr[1]), int(cr[0])


def safeprint(s, stream=sys.stdout):
    if stream.encoding not in ('UTF-8',):
        s = s.encode('ascii', 'replace')
    print s


def clip(s, length, ellipsis=True):
    if len(s) > length:
        if ellipsis:
            if sys.stdout.encoding in ('UTF-8',):
                s = s[:length-1] + u'\u2026'
            else:
                s = s[:length-3] + '...'
        else:
            s = s[:length]
    return s

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
    answer = u'\n'.join(lines)
    return answer


#---- mainline

def main(argv=sys.argv):
    # Support `complete -C 'jirash --bash-completion' jirash` for Bash
    # completion.
    if len(argv) > 1 and argv[1] == "--bash-completion":
        # exec: 'python /path/to/cmdln.py /path/to/script.py CmdlnClass'
        _dir = os.path.dirname(os.path.realpath(__file__))
        _jirashell_py = os.path.join(_dir, "jirashell.py")
        _cmdln_py = os.path.join(_dir, "cmdln.py")
        _cmd = '"%s" "%s" "%s" JiraShell %s' % (
            sys.executable, _cmdln_py, _jirashell_py, ' '.join(sys.argv[2:]))
        #print("calling `%s`" % _cmd)
        return os.system(_cmd)

    logging.basicConfig(format='%(name)s: %(levelname)s: %(message)s')
    log.setLevel(logging.INFO)
    shell = JiraShell()
    return shell.main(argv, loop=cmdln.LOOP_IF_EMPTY)


if __name__ == "__main__":
    try:
        retval = main(sys.argv)
    except KeyboardInterrupt:
        sys.exit(1)
    except SystemExit:
        raise
    except JiraShellUsageError, ex:
        print("error: %s" % ex)
        sys.exit(1)
    except:
        import platform
        import traceback
        print("")
        traceback.print_exc()
        print("""
Python: %s
OS: %s

* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
* If this is obviously not user error, please log a bug at  *
*    https://github.com/trentm/jirash/issues                *
* to report this error. Thanks!                             *
* -- Trent                                                  *
* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *""" % (
sys.version, platform.platform()))
        sys.exit(1)
    else:
        sys.exit(retval)
