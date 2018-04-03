const sourceDeploy = require('auth0-source-control-extension-tools').deploy;

const config = require('../lib/config');
const { getChanges } = require('./gitlab');

module.exports = (storage, id, projectId, branch, repository, sha, user, client) => {
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
