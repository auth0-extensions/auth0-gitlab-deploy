import _ from 'lodash';
import path from 'path';
import Promise from 'bluebird';
import GitLabApi from 'gitlab';
import { constants, unifyDatabases, unifyScripts } from 'auth0-source-control-extension-tools';

import config from './config';
import logger from '../lib/logger';

/*
 * GitLab API connection
 */
let gitlab = null;

const getApi = () => {
  if (!gitlab) {
    gitlab = new GitLabApi({
      url: config('GITLAB_URL') || 'https://intesens.gitlab.com',
      token: config('GITLAB_TOKEN')
    });
  }

  return gitlab;
};

/*
 * Check if a file is part of the rules folder.
 */
const isRule = (fileName) =>
fileName.indexOf(`${constants.RULES_DIRECTORY}/`) === 0;

/*
 * Check if a file is part of the database folder.
 */
const isDatabaseConnection = (fileName) =>
fileName.indexOf(`${constants.DATABASE_CONNECTIONS_DIRECTORY}/`) === 0;

/*
 * Check if a file is part of the page folder.
 */
const isPage = (file) =>
file.indexOf(`${constants.PAGES_DIRECTORY}/`) === 0 && constants.PAGE_NAMES.indexOf(file.split('/').pop()) >= 0;

/*
 * Get the details of a database file script.
 */
const getDatabaseScriptDetails = (filename) => {
  const parts = filename.split('/');
  if (parts.length === 3 && /\.js$/i.test(parts[2])) {
    const scriptName = path.parse(parts[2]).name;
    if (constants.DATABASE_SCRIPTS.indexOf(scriptName) > -1) {
      return {
        database: parts[1],
        name: path.parse(scriptName).name
      };
    }
  }

  return null;
};

/*
 * Only Javascript and JSON files for Rules.
 */
const validRulesOnly = (fileName) => /\.(js|json)$/i.test(fileName);

/*
 * Only valid Javascript for Connections.
 */
const validConnectionsOnly = (fileName) => /\.(js)$/i.test(fileName);

/*
 * Only valid pages files
 */
const validPagesOnly = (fileName) =>
constants.PAGE_NAMES.indexOf(fileName) >= 0;

/*
 * Only Javascript and JSON files.
 */
const validFilesOnly = (fileName) => {
  if (isPage(fileName)) {
    return true;
  } else if (isRule(fileName)) {
    return /\.(js|json)$/i.test(fileName);
  } else if (isDatabaseConnection(fileName)) {
    const script = getDatabaseScriptDetails(fileName);
    return !!script;
  }
  return false;
};

/*
 * Get a flat list of changes and files that need to be added/updated/removed.
 */
export const hasChanges = (commits) =>
_.chain(commits)
  .map(commit => _.union(commit.added, commit.modified, commit.removed))
  .flattenDeep()
  .uniq()
  .filter(validFilesOnly)
  .value()
  .length > 0;

/*
 * Get rules tree.
 */
const getPagesTree = (projectId, branch) =>
  new Promise((resolve, reject) => {
    try {
      getApi().projects.repository.listTree(projectId, {
        ref_name: branch,
        path: constants.PAGES_DIRECTORY
      }, (res) => {
        if (!res) {
          return resolve([]);
        }
        const files = res
          .filter(f => f.type === 'blob')
          .filter(f => validPagesOnly(f.name));
        files.forEach((elem, idx) => {
          files[idx].path = `${constants.PAGES_DIRECTORY}/${elem.name}`;
        });
        return resolve(files);
      });
    } catch (e) {
      reject(e);
    }
  });

/*
 * Get rules tree.
 */
const getRulesTree = (projectId, branch) =>
  new Promise((resolve, reject) => {
    try {
      getApi().projects.repository.listTree(projectId, {
        ref_name: branch,
        path: constants.RULES_DIRECTORY
      }, (res) => {
        if (!res) {
          return resolve([]);
        }

        const files = res
          .filter(f => f.type === 'blob')
          .filter(f => validRulesOnly(f.name));

        files.forEach((elem, idx) => {
          files[idx].path = `${constants.RULES_DIRECTORY}/${elem.name}`;
        });

        return resolve(files);
      });
    } catch (e) {
      reject(e);
    }
  });

/*
 * Get connection files for one db connection
 */
const getConnectionTreeByPath = (projectId, branch, filePath) =>
  new Promise((resolve, reject) => {
    try {
      getApi().projects.repository.listTree(projectId, {
        ref_name: branch,
        path: `${constants.DATABASE_CONNECTIONS_DIRECTORY}/${filePath}`
      }, (res) => {
        if (!res) {
          return resolve([]);
        }

        const files = res
          .filter(f => f.type === 'blob')
          .filter(f => validConnectionsOnly(f.name));

        files.forEach((elem, idx) => {
          files[idx].path = `${constants.DATABASE_CONNECTIONS_DIRECTORY}/${filePath}/${elem.name}`;
        });

        return resolve(files);
      });
    } catch (e) {
      reject(e);
    }
  });

/*
 * Get all files for all database-connections.
 */
const getConnectionsTree = (projectId, branch) =>
  new Promise((resolve, reject) => {
    try {
      getApi().projects.repository.listTree(projectId, {
        ref_name: branch,
        path: constants.DATABASE_CONNECTIONS_DIRECTORY
      }, (res) => {
        if (!res) {
          return resolve([]);
        }

        const subdirs = res.filter(f => f.type === 'tree');
        const promisses = [];
        let files = [];

        subdirs.forEach(subdir => {
          promisses.push(getConnectionTreeByPath(projectId, branch, subdir.name).then(data => {
            files = files.concat(data);
          }));
        });

        return Promise.all(promisses)
          .then(() => resolve(files));
      });
    } catch (e) {
      reject(e);
    }
  });

/*
 * Get full tree.
 */
const getTree = (projectId, branch) => {
  // Getting separate trees for rules and connections, as GitLab does not provide full (recursive) tree
  const promises = {
    rules: getRulesTree(projectId, branch),
    connections: getConnectionsTree(projectId, branch),
    pages: getPagesTree(projectId, branch)
  };

  return Promise.props(promises)
    .then((result) => (_.union(result.rules, result.connections, result.pages)));
};

/*
 * Download a single file.
 */
const downloadFile = (projectId, branch, file) =>
  new Promise((resolve, reject) => {
    try {
      getApi().projects.repository.showFile(projectId, { ref: branch, file_path: file.path }, (data, err) => {
        if (!data) {
          logger.error(`Error downloading '${file.path}'`);
          logger.error(err);

          return reject(new Error(`Error downloading '${file.path}'`));
        }

        return resolve({
          fileName: file.path,
          contents: (new Buffer(data.content, 'base64')).toString()
        });
      });
    } catch (e) {
      reject(e);
    }
  });

/*
 * Download a single rule with its metadata.
 */
const downloadRule = (projectId, branch, ruleName, rule) => {
  const currentRule = {
    script: false,
    metadata: false,
    name: ruleName
  };

  const downloads = [];

  if (rule.script) {
    downloads.push(downloadFile(projectId, branch, rule.scriptFile)
      .then(file => {
        currentRule.script = true;
        currentRule.scriptFile = file.contents;
      }));
  }

  if (rule.metadata) {
    downloads.push(downloadFile(projectId, branch, rule.metadataFile)
      .then(file => {
        currentRule.metadata = true;
        currentRule.metadataFile = file.contents;
      }));
  }

  return Promise.all(downloads)
    .then(() => currentRule);
};

/*
 * Determine if we have the script, the metadata or both.
 */
const getRules = (projectId, branch, files) => {
  // Rules object.
  const rules = {};

  _.filter(files, f => isRule(f.path)).forEach(file => {
    const ruleName = path.parse(file.path).name;
    rules[ruleName] = rules[ruleName] || {};

    if (/\.js$/i.test(file.name)) {
      rules[ruleName].script = true;
      rules[ruleName].scriptFile = file;
    } else if (/\.json$/i.test(file.name)) {
      rules[ruleName].metadata = true;
      rules[ruleName].metadataFile = file;
    }
  });

  // Download all rules.
  return Promise.map(Object.keys(rules), (ruleName) =>
    downloadRule(projectId, branch, ruleName, rules[ruleName]), { concurrency: 2 });
};

/*
 * Download a single database script.
 */
const downloadDatabaseScript = (projectId, branch, databaseName, scripts) => {
  const database = {
    name: databaseName,
    scripts: []
  };

  const downloads = [];

  scripts.forEach(script => {
    downloads.push(downloadFile(projectId, branch, script)
      .then(file => {
        database.scripts.push({
          name: script.name,
          scriptFile: file.contents
        });
      })
    );
  });

  return Promise.all(downloads)
    .then(() => database);
};

/*
 * Get all database scripts.
 */
const getDatabaseScripts = (projectId, branch, files) => {
  const databases = {};

  _.filter(files, f => isDatabaseConnection(f.path)).forEach(file => {
    const script = getDatabaseScriptDetails(file.path);
    if (script) {
      databases[script.database] = databases[script.database] || [];
      databases[script.database].push({
        ...script,
        id: file.id,
        path: file.path
      });
    }
  });

  return Promise.map(Object.keys(databases), (databaseName) =>
    downloadDatabaseScript(projectId, branch, databaseName, databases[databaseName]), { concurrency: 2 });
};

/*
 * Download a single page script.
 */
const downloadPage = (projectId, branch, pageName, page) => {
  const downloads = [];
  const currentPage = {
    metadata: false,
    name: pageName
  };

  if (page.file) {
    downloads.push(downloadFile(projectId, branch, page.file)
      .then(file => {
        currentPage.htmlFile = file.contents;
      }));
  }

  if (page.meta_file) {
    downloads.push(downloadFile(projectId, branch, page.meta_file)
      .then(file => {
        currentPage.metadata = true;
        currentPage.metadataFile = file.contents;
      }));
  }

  return Promise.all(downloads)
    .then(() => currentPage);
};

/*
 * Get all pages.
 */
const getPages = (projectId, branch, files) => {
  const pages = {};

  // Determine if we have the script, the metadata or both.
  _.filter(files, f => isPage(f.path)).forEach(file => {
    const pageName = path.parse(file.path).name;
    const ext = path.parse(file.path).ext;
    pages[pageName] = pages[pageName] || {};

    if (ext !== '.json') {
      pages[pageName].file = file;
      pages[pageName].sha = file.sha;
      pages[pageName].path = file.path;
    } else {
      pages[pageName].meta_file = file;
      pages[pageName].meta_sha = file.sha;
      pages[pageName].meta_path = file.path;
    }
  });

  return Promise.map(Object.keys(pages), (pageName) =>
    downloadPage(projectId, branch, pageName, pages[pageName]), { concurrency: 2 });
};

/*
 * Get a list of all changes that need to be applied to rules and database scripts.
 */
export const getChanges = (projectId, branch) =>
  getTree(projectId, branch)
    .then(files => {
      logger.debug(`Files in tree: ${JSON.stringify(files.map(file => ({ name: file.path, id: file.id })), null, 2)}`);

      const promises = {
        rules: getRules(projectId, branch, files),
        databases: getDatabaseScripts(projectId, branch, files),
        pages: getPages(projectId, branch, files)
      };

      return Promise.props(promises)
        .then((result) => ({
          rules: unifyScripts(result.rules),
          databases: unifyDatabases(result.databases),
          pages: unifyScripts(result.pages)
        }));
    });

/*
 * Get a project id by path.
 */
export const getProjectId = (filePath) =>
  new Promise((resolve, reject) => {
    try {
      getApi().projects.all(projects => {
        if (!projects) {
          return reject(new Error('Unable to determine project ID'));
        }

        const currentProject = projects.filter(f => f.path_with_namespace === filePath);

        if (currentProject[0] && currentProject[0].id) {
          return resolve(currentProject[0].id);
        }

        return reject(new Error('Unable to determine project ID'));
      });
    } catch (e) {
      reject(e);
    }
  });
