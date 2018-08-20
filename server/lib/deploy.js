import _ from 'lodash';
import { deploy as sourceDeploy } from 'auth0-source-control-extension-tools';

import sendToSlack from './slack';
import config from './config';
import { getChanges } from './gitlab';

export default (storage, id, projectId, branch, repository, sha, user, client) => {
  const clearEmpty = (data) => {
    if (!data) {
      return null;
    }

    return _.pickBy(data, (entity) => entity.deleted + entity.created + entity.updated > 0);
  };

  const saveProgress = (progress, error) =>
    storage.read()
      .then((data) => {
        const maxLogs = 20;
        const report = {
          id,
          sha,
          user,
          branch,
          repository,
          error,
          logs: clearEmpty(progress) || error,
          date: new Date()
        };

        data.deployments = data.deployments || [];
        data.deployments.push(report);
        data.deployments = data.deployments.splice(-maxLogs, maxLogs);

        return storage.write(data).then(() => report);
      });

  const version = (id === 'manual') ? sha : branch;

  return getChanges(projectId, version)
    .then(assets => sourceDeploy(assets, client, config))
    .then(data => saveProgress(data))
    .then(report => sendToSlack(report, `${config('WT_URL')}/login`, config('SLACK_INCOMING_WEBHOOK_URL')))
    .catch(err => {
      return saveProgress(null, err.message || err)
        .then((report) => sendToSlack(report, `${config('WT_URL')}/login`, 'localhost'))
        .then(() => Promise.reject(err));
    });
};
