import { getProjectId } from './gitlab';
import deploy from './deploy';

export default (storage, id, branch, repository, sha, user, client) =>
  getProjectId(repository).then(projectId => deploy(storage, id, projectId, branch, repository, sha, user, client));
