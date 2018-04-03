const { getProjectId } = require('./gitlab');
const deploy = require('./deploy');

module.exports = (storage, id, branch, repository, sha, user, client) =>
  getProjectId(repository).then(projectId => deploy(storage, id, projectId, branch, repository, sha, user, client));
