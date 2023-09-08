import db from '../database';
import user from '../user';

interface Group {
    slug: string;
    createtime: number;
    memberCount: number;
    hidden: boolean;
}

interface SearchOptions {
    hideEphemeralGroups?: boolean;
    showMembers?: boolean;
    filterHidden?: boolean;
    sort?: string;
}

module.exports = function (Groups: any) {
    Groups.search = async function (query: string, options: SearchOptions = {}) {
        if (!query) {
            return [];
        }
        query = String(query).toLowerCase();
        let groupNames: string[] = await db.getSortedSetRange('groups:createtime', 0, -1);
        if (!options.hideEphemeralGroups) {
            groupNames = Groups.ephemeralGroups.concat(groupNames);
        }
        groupNames = groupNames.filter(
            (name) =>
                name.toLowerCase().includes(query) &&
                name !== Groups.BANNED_USERS && // hide banned-users in searches
                !Groups.isPrivilegeGroup(name)
        );
        groupNames = groupNames.slice(0, 100);

        let groupsData: Group[];
        if (options.showMembers) {
            groupsData = await Groups.getGroupsAndMembers(groupNames);
        } else {
            groupsData = await Groups.getGroupsData(groupNames);
        }
        groupsData = groupsData.filter(Boolean);
        if (options.filterHidden) {
            groupsData = groupsData.filter((group) => !group.hidden);
        }
        return Groups.sort(options.sort, groupsData);
    };

    Groups.sort = function (strategy: string, groups: Group[]) {
        switch (strategy) {
        case 'count':
            groups.sort((a, b) => (a.slug > b.slug ? 1 : -1))
                .sort((a, b) => b.memberCount - a.memberCount);
            break;

        case 'date':
            groups.sort((a, b) => b.createtime - a.createtime);
            break;

        case 'alpha': // intentional fall-through
        default:
            groups.sort((a, b) => (a.slug > b.slug ? 1 : -1));
        }

        return groups;
    };

    Groups.searchMembers = async function (data: any) {
        if (!data.query) {
            const users = await Groups.getOwnersAndMembers(data.groupName, data.uid, 0, 19);
            return { users: users };
        }

        const results = await user.search({
            ...data,
            paginate: false,
            hardCap: -1,
        });

        const uids = results.users.map((user) => user && user.uid);
        const isOwners = await Groups.ownership.isOwners(uids, data.groupName);

        results.users.forEach((user, index) => {
            if (user) {
                user.isOwner = isOwners[index];
            }
        });

        results.users.sort((a, b) => {
            if (a.isOwner && !b.isOwner) {
                return -1;
            } else if (!a.isOwner && b.isOwner) {
                return 1;
            }
            return 0;
        });
        return results;
    };
};
