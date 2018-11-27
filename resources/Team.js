define(["dojo/_base/declare",
    "require",
    "dojo/_base/lang",
    "dojo/query",
    "dojo/on",
    "dojo/dom-attr",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/promise/all",
    "dojo/when",
    "./jazzUtilities/SiemensWidget",
    "jazz.ui.ResourceLink",
    "jazz.ui.ModeledTree",
    "jazz.ui.tree.AbstractItem", //this will log as error, but has be so until jazz adapts amd (dojo 1.7+)
    "com.ibm.team.dashboard.viewlets.web.client.internal.TeamsClient",
    "com.ibm.team.dashboard.web.util.DashboardUtil",
    "dojox.xml.parser",
    "dojo/domReady!"
], function (declare, require, lang, query, on, domAttr, domConstruct, domStyle, all, when, SiemensWidget) {

    var DashboardConstants = com.ibm.team.dashboard.web.ui.DashboardConstants;
    var DashboardUtil = com.ibm.team.dashboard.web.util.DashboardUtil;
    var TeamsClient = com.ibm.team.dashboard.viewlets.web.client.internal.TeamsClient;
    var ServiceResponseHandler = com.ibm.team.repository.web.transport.ServiceResponseHandler;
    var modeledTree = jazz.ui.ModeledTree;
    var AbstractItem = jazz.ui.tree.AbstractItem;
    var SimpleItem = jazz.ui.tree.SimpleItem;
    var LinkItem = jazz.ui.ResourceLink;

    var TeamResourceTreeItem = declare(AbstractItem, {
        postCreate: function () {
            this.inherited(arguments);

            this.rl = new LinkItem({
                uri: this._getResourceURL(),
                presentationUri: this._getPresenationURL(),
                label: jazz.util.html.escape(this.team.name),
                isExternalContent: false,
                lazyFetch: true
            });
            this.domNode = this.rl.domNode;
        },

        _getResourceURL: function () {
            // e.g.
            // https://localhost:9443/jazz/process/project-areas/_WOqPMDujEeCIDJ7vsnU5zQ/team-areas/_Tj9RkDulEeCAZ5rY1YKmyQ

            var url = this.webURL +
                "/process/project-areas/" +
                this.project.itemId +
                "/team-areas/" +
                this.team.itemId;

            if (djConfig.isDebug) {
                url = url + "?debug=true";
            }

            return url;
        },

        _getPresenationURL: function () {
            // e.g.
            // https://localhost:9443/jazz/web/projects/Jazz%20Project#action=com.ibm.team.dashboard.viewDashboard&team=Foundation

            return DashboardUtil.getDashboardHref(DashboardConstants.SCOPE_TEAM_AREA,
                this.team.path,
                null,
                this.project.name,
                this.webURL);
        },

        getId: function () {
            return this.team.itemId;
        },

        uninitialize: function () {
            this.rl.destroy();
        }

    });

    return declare("com.siemens.bt.jazz.viewlet.myteams.Team", SiemensWidget, {
        templatePath: require.toUrl("./templates/Team.html", "./templates/Team.css"),

        //change between filtered/not
        buttonClicked: function () {
            this.filtered = !this.filtered;
            this.refresh();
        },

        //show/hide roles button has been clicked
        buttonRolesClicked: function () {
            this.showRoles = !this.showRoles;
            this.refresh();
        },

        //on Teamarea level it still shows all tas of pa, so scoping to ta makes no sense
        _createWrongScopeMessage: function () {
            var msgSpan = document.createElement("span");
            msgSpan.innerHTML = "The my Teams filter only works for project areas.";
            if (this.getSite().isDashboardEditing()) {
                var editSpan = document.createElement("span");
                editSpan.innerHTML = "Please select one from the widget <a href=\"#!\">Settings</a>.";
                this.connect(editSpan, "onclick", this._handleToggleSettings);
                msgSpan.appendChild(editSpan);
            }
            return msgSpan;
        },

        init: function () {
            this.filtered = this.getPreference("filterPref"); //corresponds to change teamfilter buttton
            this.showRoles = this.getPreference("rolesPref");//corresponds to rolesbutton
            this.initialize(); //Function from superclass
            this.buildTopMenu(); //Function from superclass

        },


        getTAsUnfiltered: function () {
            var serviceObj = {
                self: this,
                success: function (result) {
                    if (!result || !result.children || result.children.length === 0) {
                        this.self.getSite().setSecondaryTitle("");
                        this.self._content.innerHTML = this.self.getScope() === DashboardConstants.SCOPE_PROJECT_AREA ?
                            "There are no teams for this project area." : "There are no sub-teams for this team area.";
                    } else {
                        this.self._checkTeams(result.children);
                        this.self.getSite().setSecondaryTitle("(" + this.self._count + ")");
                        var useLinks = this.self.getSite().canViewDashboard(DashboardConstants.SCOPE_TEAM_AREA);
                        var webURL = this.self.getWebURL();
                        var param = {
                            model: result.children, selection: false,
                            createTreeItem: function (obj) {
                                if (useLinks) {
                                    return new TeamResourceTreeItem({
                                        team: obj,
                                        project: {
                                            name: result.projectName,
                                            itemId: result.projectItemId
                                        },
                                        webURL: webURL
                                    });
                                }
                                return new SimpleItem({
                                    label: html.escape(obj.name), itemId: obj.itemId, getId: function () {
                                        return this.itemId;
                                    }
                                });
                            },
                            onStateChange: dojo.hitch(this.self, this.self._treeStateChanged)
                        };
                        this.self._teamsTree = new modeledTree(param);
                        var oldState = this.self.getContributorState().get("treeState");
                        if (oldState && this.self.getScope() === this.self.getContributorState().get("scope") &&
                            this.self.getScopeItem().itemId === this.self.getContributorState().get("scopeItemId")) {
                            this.self._teamsTree.restoreState(oldState);
                        }
                        this.self._content.appendChild(this.self._teamsTree.domNode);
                    }
                },
                failure: function (errorObj) {
                    // read permission
                    if (errorObj && errorObj.status === 403) {
                        var span = document.createElement("span");
                        span.className = "errorText";
                        var message = this.self._getOperationalErrorText("yey",
                            "yay",
                            "yuy"); //permission denied messages
                        span.appendChild(document.createTextNode(message));
                        this.self._content.innerHTML = "";
                        this.self._content.appendChild(span);
                        this.self.getSite().setSecondaryTitle("");
                        //this.self.getSite().setLoading(false);
                        //this.self.getSite().doneRefresh();
                    }
                    else {
                        //this.self.getSite().doneRefresh();
                        this.self.getSite().error(errorObj);
                    }
                }
            }; //callback with success/failure for rest call
            var srh = new ServiceResponseHandler(serviceObj, "success", "failure");

            if (this.getScope() === DashboardConstants.SCOPE_PROJECT_AREA)
                TeamsClient.getTeamsForProjectArea(this.getScopeItem().itemId, this.getScopeSubteams(), srh, this.getServiceTracker());
            else
                TeamsClient.getTeamsForTeamArea(this.getScopeItem().itemId, this.getScopeSubteams(), srh, this.getServiceTracker());
        },

        _getRolesAsXML: function () {
            return jazz.client.xhrGet({
                url: this.webURL +
                    "/process/project-areas/" +
                    this.projectUuid + "/roles"
            }).then(function (result) {
                return result;
            });
        },
        refresh: function () {

            this.debugMessage("refresh()");
            domStyle.set(this._rolesButton, 'display', 'none'); //important don't use id, will cause problem if multiple widgets
            while (this._content.firstChild)
                this._content.removeChild(this._content.firstChild);
            if (this._teamsTree)
                this._teamsTree.destroy();
            // handle Auto(none) scope when no team areas
            if (!this.getScopeItem()) {
                this._content.innerHTML = "";
                this._content.appendChild(this._createNoScopeMsg());
                this.getSite().setSecondaryTitle("");
                this.getSite().doneRefresh();
                return;
            }
            this.getSite().setLoading(true);


            if (this.filtered) {
                domStyle.set(this._rolesButton, 'display', '');
                this._pseudoButton.innerHTML = "Show all Teams";
                if (this.showRoles) {
                    this._rolesButton.innerHTML = "Hide Roles";
                }
                else {
                    this._rolesButton.innerHTML = "Show Roles";
                }

                var userUrl = this.UserId();
                try {
                    this.projectUuid = this.getSite().context.properties["com.ibm.team.dashboard.scopeItem"].projectArea.itemId;
                    //works for pa and ta, but not for minidash (because user is scopeItem even if scope is changed in settings)
                }
                catch (e) {
                    var itemId = this.getScopeItem().itemId; //this scopeItem changes with settings so it's pa or ta
                    if (this.getScope() === DashboardConstants.SCOPE_PROJECT_AREA && itemId !== undefined) {
                        this.projectUuid = itemId;
                    }
                    else if (this.getScope() === DashboardConstants.SCOPE_TEAM_AREA) {
                        this._content.appendChild(this._createWrongScopeMessage());
                        this.getSite().setSecondaryTitle("");
                        this.getSite().doneRefresh();
                        return;
                    }
                    else {
                        this.refresh();
                        return; //probably unnecessary but convenient in case of bad code or race condition
                    }
                }
                var getRoleNames = this._getRolesAsXML();
                this.getTAsForURL();
                var tasUrl = this.getTAsUrl(userUrl);
                getRoleNames.then((function (roleXML) {
                    this.rolesXML = roleXML;
                    this.getTAsFiltered(tasUrl);
                }).bind(this));

            }
            else {
                this._pseudoButton.innerHTML = "Show only my Teams";
                domStyle.set(this._rolesButton, 'display', 'none');
                this.getTAsUnfiltered();
            }
            this._updateTitle();
            this.update();
            this.getSite().setLoading(false);
            this.getSite().doneRefresh();

        },
        _getOperationalErrorText: function (message, explanation, useraction) {
            return message + " " +
                explanation + " " +
                useraction;
        },

        _checkTeams: function (teams) {
            this._count = 0;
            this._checkSubTeams(teams);
        },

        _checkSubTeams: function (teams) {
            this._count += teams.length;
            teams.sort(this._sortTeams);
            for (var i = 0; i < teams.length; i++) {
                if (teams[i].children) {
                    this._checkSubTeams(teams[i].children);
                }
            }
        },

        _createNoScopeMsg: function () {
            domStyle.set('pseudoButton', 'display', 'none');
            var msgSpan = document.createElement("span");
            msgSpan.innerHTML = "This widget is not scoped to a project area. Please select one from the widget ";
            if (this.getSite().isDashboardEditing()) {
                var node = domConstruct.create("a", {innerHTML: "Settings.", href: "#!"});
                this.connect(node, "onclick", this._handleToggleSettings);
                msgSpan.appendChild(node);
            }
            return msgSpan;
        },

        //open Settings
        _handleToggleSettings: function (event) {
            event.preventDefault(); //prevents the link from being loaded
            this.getSite().toggleSettings();
        },

        _sortTeams: function (a, b) {
            return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
        },

        //gets all tas where user is member in pa
        getTAsUrl: function (user) {

            return this.webURL +
                "/process/project-areas/" +
                this.projectUuid +
                "/team-areas?hasMember=" +
                user;
        },

        //gets called automatically when settings are saved
        settingsChanged: function (oldSettings, newSettings) {
            var scopeChanged = false;//have to refresh or nay
            var updateTitle = false;

            if (newSettings.scope !== oldSettings.scope || newSettings.scopeItemId !== oldSettings.scopeItemId) {
                updateTitle = true;
                scopeChanged = true;
            }
            if (newSettings.preferences.filterPref !== oldSettings.preferences.filterPref) {
                this.filtered = newSettings.preferences.filterPref;
                scopeChanged = true;
            }

            if (newSettings.preferences.rolesPref !== oldSettings.preferences.rolesPref) {
                this.showRoles = newSettings.preferences.rolesPref;
                scopeChanged = true;
            }

            if (updateTitle || newSettings.userTitle !== oldSettings.userTitle)
                this._updateTitle();
            if (scopeChanged || (newSettings.scope !== DashboardConstants.SCOPE_CONTRIBUTOR && newSettings.scopeSubteams !== oldSettings.scopeSubteams)) {
                //this.getTAsForURL();
                domStyle.set('pseudoButton', 'display', '');
                this.refresh();
            }
            else
                this.update();
        },

        _treeStateChanged: function () {
            var state = this._teamsTree.getState();
            this.getContributorState().set("treeState", state);
            if (this.getContributorState().get("scope") !== this.getScope())
                this.getContributorState().set("scope", this.getScope());
            if (this.getContributorState().get("scopeItemId") !== this.getScopeItem().itemId)
                this.getContributorState().set("scopeItemId", this.getScopeItem().itemId);
        },

        _updateTitle: function () {
            // name can be unavailable if no read permission on scope item
            //use scope item name except if it is user(default minidash)
            this.getSite().setTitle((this.getScopeItem() && this.getScopeItem().name) ? dojo.string.substitute("'${0}' Teams", [this.getScopeItem().name]) : "My");
        },

        uninitialize: function () {
            if (this._teamsTree)
                this._teamsTree.destroy();
        },

        // Return the ID of the current user
        UserId: function () {

            var con = com.ibm.team.repository.web.client.internal.AUTHENTICATED_CONTRIBUTOR;
            if (con) {
                return con.userId;
            }
            var id = com.ibm.team.repository.web.client.internal.AUTHENTICATED_USERID;
            if (id) {
                return id
            }
            //name kind of id (email on production i think)
            return com.ibm.team.repository.web.client.session.getAuthenticatedUserId();
        },

        extractRoles: function (member, row) {
            var split = member.querySelector("url").textContent.split("/");
            var name = decodeURIComponent(split[split.length - 1]); // url's are encoded, decode so that user ID's with an '@' are properly treated
            if (name === this.UserId()) {
                var roleUris = member.querySelectorAll("role-url");//get all role(urls) user has
                // var roleUriDetails = [];


                var roleNodes = dojox.xml.parser.parse(this.rolesXML); //collection of roles with label
                var roleLabels = [];

                var roles = roleNodes.querySelectorAll("role");

                for (var j = 0; j < roles.length; j++) {

                    var roleUri = roles[j].querySelector("url");

                    // search for each roles name in roleNodes
                    for (var i = 0; i < roleUris.length; i++) {
                        if (roleUris[i].textContent === roleUri.textContent) {
                            roleLabels.push(roles[j].querySelector("label").textContent);
                        }
                    }

                }

                var roleString = roleLabels.filter(function (e) {
                    return e !== "default" ? e : null;
                }).sort().join(", ");

                domConstruct.place("<div class='roles'>" + roleString + "</div>", row, "last");
            }

        },

//Adds Roles to teamarea row
        getRoles: function (memberRoleUrl, row) {
            var deferred = jazz.client.xhrGet({
                url: memberRoleUrl //"/jazz/SomeResource"
            });
            deferred.addBoth(lang.hitch(this, function (result) {
                if (result instanceof Error) {
                    console.error("Could not read roles, cause:" + result);
                } else {
                    var xmlString = dojox.xml.parser.parse(result);
                    var de = xmlString.documentElement;
                    var members = de.children; //no null check necessary since it has at least user as member
                    for (var i = 0; i < members.length; i++) {
                        this.extractRoles(members[i], row);
                    }
                }
            }));
        }
        ,

//get all tas so path to dashboard is available
        getTAsForURL: function () {
            var self = this;
            var serviceObj = {
                self: this,
                success: function (result) {
                    this.self.tasTree = result.children;

                },
                failure: function (errorObj) {
                    console.error("Could not get Teamareas");
                    this.getSite().error(errorObj);
                }
            };
            var srh = new ServiceResponseHandler(serviceObj, "success", "failure");

            TeamsClient.getTeamsForProjectArea(this.projectUuid.toString(), true, srh, this.getServiceTracker());
        }
        ,

//returns path to teamarea name
        searchTree: function (name, array) {
            var stack = [];
            stack = stack.concat(array);
            while (stack.length) {
                var node = stack.pop();
                if (node.name === name) return node.path;
                else if (node.children !== undefined) stack = stack.concat(node.children);
            }
            return stack.pop() || null;
        }
        ,

//only "my" tas
        getTAsFiltered: function (urlTAs) {
            var scope = this.getScopeItem();
            var pname = this.getScope() === DashboardConstants.SCOPE_PROJECT_AREA ?
                scope.name : window.location.pathname.split("/")[4];
            pname = decodeURIComponent(pname);
            var contentDiv = this._content;
            //display root(pa) team if user is member
            var memberOfRoot = jazz.client.xhrGet({
                url: this.webURL +
                    "/process/project-areas/" +
                    this.projectUuid + "/members/" + this.UserId(),
                error: function () {
                    return 0;
                }
            }).then((function (rootResult) {
                if (rootResult === 0) {
                    return 0;
                }
                else {
                    var rootXml = dojox.xml.parser.parse(rootResult);
                    var popUpUri = this.webURL + "/process/project-areas/" + this.projectUuid;
                    var dashBoardUri = DashboardUtil.getDashboardHref(DashboardConstants.SCOPE_PROJECT_AREA,
                        pname,
                        null,
                        pname);
                    var teamLink = new LinkItem({
                        uri: popUpUri,
                        label: pname,
                        lazyFetch: true,
                        presentationUri: dashBoardUri,
                        isExternalContent: false
                    });

                    var row = domConstruct.toDom("<div class=\"row leaf myTeam\"></div>");
                    row.appendChild(teamLink.domNode);
                    if (this.showRoles) {
                        this.extractRoles(rootXml, row); //only one member here
                    }
                    domConstruct.place(row, contentDiv, "last");
                    return 1;
                }
            }).bind(this));

            //get tas user is member of
            var deferred = jazz.client.xhrGet({
                url: urlTAs //"/jazz/SomeResource"
            });

            deferred.addBoth(lang.hitch(this, function (result) {
                if (result instanceof Error) {
                    console.error("Could not get Teamareas");
                    this.getSite().error(result);
                } else {
                    when(memberOfRoot, lang.hitch(this, function (isRootMember) {

                        var xmlString = dojox.xml.parser.parse(result);
                        var de = xmlString.documentElement;
                        var tas = de.children;
                        if ((!tas || tas.length === 0) && isRootMember === 0) {
                            contentDiv.innerHTML = "You're not part of any Teams in this project area.";
                            return;
                        }
                        this.getSite().setSecondaryTitle("(" + (tas.length + isRootMember) + ")");
                        for (var i = 0; i < tas.length; i++) {
                            var popUpUri = tas[i].querySelector("url").textContent; //url for the thing that pops up on mouse hoover
                            var memberrole = tas[i].querySelector("members-url").textContent; //url to members and their roles
                            var name = tas[i].attributes[0].value;
                            var path = this.searchTree(name, this.tasTree);
                            var dashBoardUri = DashboardUtil.getDashboardHref(DashboardConstants.SCOPE_TEAM_AREA,
                                path,
                                null,
                                pname);
                            var teamLink = new LinkItem({
                                uri: popUpUri,
                                label: name,
                                lazyFetch: true,
                                presentationUri: dashBoardUri,
                                isExternalContent: false
                            });

                            var row = domConstruct.toDom("<div class=\"row leaf myTeam\"></div>");
                            row.appendChild(teamLink.domNode);
                            if (this.showRoles) {
                                this.getRoles(memberrole, row);
                            }
                            domConstruct.place(row, contentDiv, "last");
                        }
                    }));
                }

                return result; // for other handlers in the chain
            }));
        }


    })
        ;


})
;