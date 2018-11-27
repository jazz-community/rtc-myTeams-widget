# My Teams Widget for RTC

This widget expands the standard Teams widget with an option to filter
for only the teams the authenticated user is part of. It can also show the roles.
The widget is intended to allow users a quick navigation and better overview, especially
when there are a lot of teams.

## States

It has 3 possible States, easily changeable by clicking the corresponding Buttons:
1. Show only the Teams the user is part of and the roles he has
2. Show only the Teams the user is part of without the Roles
3. Show all Teams

![Example Widget](resources/images/MyTeamsWRoles.png "The widget showing only 'my' Teams and Roles")

When showing only the Teams the user is part of the Project is displayed as well and all teams are included even if it's on a dashboard of a Subteam.
 Roles include the inherited ones.


## Setup

### Download
You can find the latest release on the [releases page of this repository](../../realeases).

### Installation
Deploy just like any other update site:

1. Extract the `com.siemens.bt.jazz.viewlet.myteams.Team_updatesite.ini` **file** from the zip file to the `server/conf/ccm/provision_profiles` directory
2. Extract the `com.siemens.bt.jazz.viewlet.myteams.Team_updatesite` **folder** to the `server/conf/ccm/sites` directory
3. Restart the server

### Updating an existing installation
1. Request a server reset in **one** of the following ways:
    * If the server is currently running, call `https://server-address/ccm/admin/cmd/requestReset`
    * Navigate to `https://server-address/ccm/admin?internaltools=true` so you can see the internal tools (on the left in the side-pane).
     Click on `Server Reset` and press the `Request Server Reset` button
    * If your server is down, you can delete the ccm `built-on.txt` file.
     Liberty packed with 6.0.3 puts this file in a subfolder of `server/liberty/servers/clm/workarea/org.eclipse.osgi/**/ccm`. The easiest way to locate the file is by using your operating system's search capabilities.
2. Delete previously deployed updatesite folder
3. Follow the file extraction steps from the section above
4. Restart the server

### Configuration

1. Add the Widget to a Dashboard. You can find it under "Project/Team"
2. You may need to set a Project under Settings
3. Under Settings you can configure the default State (my/all Teams, w/o Roles)

![Settings](resources/images/Settings.png "The Settings(click red triangle to get there)")

# About this Plug-In
## Compatibility
This plug-in has been verified to work on RTC 6.0.3 and onward. According to our information, the mechanism for creating non-attribute-based presentations has not changed since one of the first releases of RTC, so we expect it to work with any version of RTC. If not, we would appreciate your feedback.

## Contributing
Please use the [Issue Tracker](../../issues) of this repository to report issues or suggest enhancements.

For general contribution guidelines, please refer to [CONTRIBUTING.md](https://github.com/jazz-community/welcome/blob/master/CONTRIBUTING.md)

## Licensing
Copyright (c) Siemens AG. All rights reserved.<br>
Licensed under the [MIT](./LICENSE) License.
