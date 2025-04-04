import React, { useEffect, useState, useMemo } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import uniqBy from 'lodash/uniqBy';
import debounce from 'lodash/debounce';
import { useIntl } from 'react-intl';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import jwtDecode from 'jwt-decode';
import { toast } from 'react-toastify';
import { Button, Checkbox } from 'semantic-ui-react';
import { messages } from '@plone/volto/helpers/MessageLabels/MessageLabels';
import { isManager, canAssignGroup } from '@plone/volto/helpers/User/User';
import Icon from '@plone/volto/components/theme/Icon/Icon';
import Toast from '@plone/volto/components/manage/Toast/Toast';
import { listGroups, updateGroup } from '@plone/volto/actions/groups/groups';
import { getUser, listUsers } from '@plone/volto/actions/users/users';

import down_key from '@plone/volto/icons/down-key.svg';

const ListingTemplate = ({
  query_user, // Show users on y-axis that match
  query_group, // Show groups on y-axis that match
  groups_filter, // show members of these groups
  add_joined_groups, // Toggle: show also groups joined by users below
  many_users,
  many_groups,
}) => {
  const intl = useIntl();
  const dispatch = useDispatch();

  const pageSize = 25;
  const [userLimit, setUserLimit] = useState(pageSize);

  const token = useSelector((state) => state.userSession.token, shallowEqual);
  const user = useSelector((state) => state.users.user);
  const userId = token ? jwtDecode(token).sub : '';

  useEffect(() => {
    dispatch(getUser(userId));
  }, [dispatch, userId]);

  const isUserManager = isManager(user);

  // y axis
  let items = useSelector((state) => state.users.users);
  let show_users =
    !many_users ||
    (many_users && query_user.length > 1) ||
    (many_users && groups_filter.length > 0); // Stay with '> 0', as these are already groups, not querystring to search for groups.
  if (show_users) {
    items.sort(function (a, b) {
      var labelA =
        (a.fullname && a.fullname.split(' ').reverse().join(' ')) || a.id;
      var labelB =
        (b.fullname && b.fullname.split(' ').reverse().join(' ')) || b.id;
      if (labelA < labelB) {
        return -1;
      }
      if (labelA > labelB) {
        return 1;
      }
      return 0;
    });
  } else {
    items = [];
  }

  // x axis
  let groups = useSelector((state) => state.groups.groups);

  const getRoles = (group_id) => {
    return groups.find((group) => group.id === group_id)?.roles || [];
  };

  let show_matrix_options =
    !many_groups ||
    (many_groups && query_group.length > 1) ||
    groups_filter.length > 0 ||
    add_joined_groups;
  let matrix_options; // list of Objects (value, label, roles)
  if (show_matrix_options) {
    matrix_options =
      !many_groups || (many_groups && query_group.length > 1)
        ? cloneDeep(groups)
        : [];
    if (add_joined_groups) {
      items.map((item) => {
        matrix_options.push(...item.groups.items);
        return item.groups.items;
      });
    }
    matrix_options = matrix_options.map((group) => ({
      value: group.id,
      label: group.title || `${group.id}`,
    }));
    if (groups_filter.length > 0) {
      matrix_options = groups_filter.concat(matrix_options);
    }
    matrix_options = uniqBy(matrix_options, (x) => x.value);
    matrix_options = matrix_options.filter((group) => {
      return group.value !== 'AuthenticatedUsers';
    });
    matrix_options.sort(function (a, b) {
      var labelA = a.label.toUpperCase();
      var labelB = b.label.toUpperCase();
      if (labelA < labelB) {
        return -1;
      }
      if (labelA > labelB) {
        return 1;
      }
      return 0;
    });
    matrix_options = matrix_options.map((matrix_option) => ({
      ...matrix_option,
      roles: getRoles(matrix_option.value),
    }));
  } else {
    matrix_options = [];
  }

  const debouncedListUsers = useMemo(
    () =>
      debounce((query_user, groups_filter, userLimit) => {
        dispatch(
          listUsers({
            search: query_user,
            groups_filter: groups_filter.map((el) => el.value),
            limit: userLimit,
          }),
        );
      }, 300),
    [dispatch],
  );

  useEffect(() => {
    // Get users.
    if (show_users) {
      debouncedListUsers(query_user, groups_filter, userLimit);
    }
  }, [debouncedListUsers, query_user, groups_filter, show_users, userLimit]);

  const debouncedListGroups = useMemo(
    () =>
      debounce((query_group) => {
        dispatch(listGroups(query_group));
      }, 300),
    [dispatch],
  );

  useEffect(() => {
    // Get matrix groups.
    if (show_matrix_options) {
      debouncedListGroups(query_group);
    }
  }, [debouncedListGroups, query_group, show_matrix_options]);

  const onSelectOptionHandler = (selectedvalue, checked, singleClick) => {
    singleClick = singleClick ?? false;
    let group = selectedvalue.y;
    let username = selectedvalue.x;

    dispatch(
      updateGroup(group, {
        users: {
          [username]: checked ? true : false,
        },
      }),
    )
      .then(() => {
        singleClick &&
          dispatch(
            listUsers({
              search: query_user,
              groups_filter: groups_filter.map((el) => el.value),
              limit: userLimit,
            }),
          );
      })
      .then(() => {
        singleClick &&
          toast.success(
            <Toast
              success
              title={intl.formatMessage(messages.success)}
              content={intl.formatMessage(messages.membershipUpdated)}
            />,
          );
      });
  };

  const onSelectAllHandler = (group, items_ids, checked) => {
    let usersgroupmapping = {};
    items_ids.forEach((el) => {
      usersgroupmapping[el] = checked ? true : false;
    });

    dispatch(
      updateGroup(group, {
        users: usersgroupmapping,
      }),
    )
      .then(() => {
        dispatch(
          listUsers({
            search: query_user,
            groups_filter: groups_filter.map((el) => el.value),
            limit: userLimit,
          }),
        );
      })
      .then(() => {
        toast.success(
          <Toast
            success
            title={intl.formatMessage(messages.success)}
            content={intl.formatMessage(messages.membershipUpdated)}
          />,
        );
      });
  };

  return (
    <div className="administration_matrix">
      {matrix_options && matrix_options?.length > 0 && (
        <div className="label-options">
          <div className="target-labels">
            <div>
              <h3>{items.length} users</h3>
            </div>
            <div>
              {matrix_options?.map((matrix_option) => (
                <div
                  className="label-options-label inclined"
                  key={matrix_option.value}
                >
                  <div>
                    <span className="label">{matrix_option.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="listing-row selectall" key="selectall">
            <div className="listing-item">
              <div />
              <div className="matrix_options">
                {matrix_options?.map((matrix_option) => (
                  <div key={matrix_option.value}>
                    <Checkbox
                      className="toggle-target"
                      defaultChecked={false}
                      onChange={(_event, { checked }) =>
                        onSelectAllHandler(
                          matrix_option.value,
                          items.map((el) => el.id),
                          checked,
                        )
                      }
                      disabled={!canAssignGroup(isUserManager, matrix_option)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="items">
        {items.length > 0 ? (
          <>
            {items.map((item) => (
              <div
                className="listing-row"
                key={item.id}
                id={`source-row-${item.id}`}
              >
                <div className="listing-item" key={item['@id']}>
                  <div>
                    <h4 title={`${item.fullname} ${item.id}`}>
                      {item.fullname?.length > 25
                        ? item.fullname.slice(0, 22) + '...'
                        : item.fullname || item.id}
                    </h4>
                  </div>
                  <div className="matrix_options">
                    {matrix_options?.map((matrix_option) => (
                      <Checkbox
                        className={`checkbox_${matrix_option.value}`}
                        key={matrix_option.value}
                        title={matrix_option.title}
                        checked={item.groups?.items
                          ?.map((el) => el.id)
                          .includes(matrix_option.value)}
                        onChange={(_event, { checked }) => {
                          onSelectOptionHandler(
                            { y: matrix_option.value, x: item.id },
                            checked,
                            true,
                          );
                        }}
                        disabled={!canAssignGroup(isUserManager, matrix_option)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {!(items.length < pageSize) ? (
              <div className="show-more">
                <Button
                  icon
                  basic
                  onClick={() => setUserLimit(userLimit + pageSize)}
                  className="show-more-button"
                >
                  <Icon name={down_key} size="30px" />
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div>
            {intl.formatMessage(
              show_users
                ? query_user
                  ? messages.noUserFound
                  : messages.pleaseSearchOrFilterUsers
                : messages.pleaseSearchOrFilterUsers,
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default ListingTemplate;
