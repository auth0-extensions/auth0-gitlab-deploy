import { deploy as sourceDeploy } from 'auth0-source-control-extension-tools';

import config from '../lib/config';
import { getChanges } from './gitlab';

export default (storage, id, projectId, branch, repository, sha, user, client) => {
  const version = (id === 'manual') ? sha : branch;

  const context = {
    init: () => getChanges(projectId, version)
      .then(data => {
        context.pages = data.pages;
        context.rules = data.rules;
        context.databases = data.databases;
        context.clients = data.clients;
        context.ruleConfigs = data.ruleConfigs;
        context.resourceServers = data.resourceServers;
      })
  };

  const slackTemplate = {
    fallback: 'Gitlab to Auth0 Deployment',
    text: 'Gitlab to Auth0 Deployment'
  };

  return sourceDeploy({ id, branch, repository, sha, user }, context, client, storage, config, slackTemplate);
};
