import config from './config';
import { getProjectId } from './gitlab';

import deploy from './deploy';


export default (storageContext, id, branch, repository, sha, user) =>
  getProjectId(repository).then(projectId => deploy(storageContext, id, projectId, branch, repository, sha, user));
