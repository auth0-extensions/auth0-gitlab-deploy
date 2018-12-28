import _ from 'lodash';
import path from 'path';
import Promise from 'bluebird';
import GitLabApi from 'gitlab';
import { constants } from 'auth0-source-control-extension-tools';

import config from './config';
import logger from './logger';

/*
 * GitLab API connection
 */
let gitlab = null;

const getApi = () => {
  if (!gitlab) {
    gitlab = new GitLabApi({
      url: config('GITLAB_URL') || 'https://gitlab.com',
      token: config('GITLAB_TOKEN')
    });
  }

  return gitlab;
};

const getBaseDir = () => {
  let baseDir = config('BASE_DIR') || '';
  if (baseDir.startsWith('/')) baseDir = baseDir.slice(1);
  if (baseDir !== '' && !baseDir.endsWith('/')) baseDir += '/';

  return baseDir;
};

/*
 * Check if a file is part of the rules folder.
 */
const isRule = (fileName) =>
  fileName.indexOf(`${getBaseDir()}${constants.RULES_DIRECTORY}/`) === 0;

/*
 * Check if a file is part of the database folder.
 */
const isDatabaseConnection = (fileName) =>
  fileName.indexOf(`${getBaseDir()}${constants.DATABASE_CONNECTIONS_DIRECTORY}/`) === 0;

/*
 * Check if a file is part of the templates folder - emails or pages.
 */
const isTemplates = (file, dir, allowedNames) =>
  file.indexOf(`${getBaseDir()}${dir}/`) === 0 && allowedNames.indexOf(file.split('/').pop()) >= 0;

/*
 * Check if a file is email provider.
 */
const isEmailProvider = (file) =>
  file === `${getBaseDir()}${constants.EMAIL_TEMPLATES_DIRECTORY}/provider.json`;

/*
 * Check if a file is part of configurable folder.
 */
const isConfigurable = (file, directory) =>
  file.indexOf(`${getBaseDir()}${directory}/`) === 0;

const unifyItem = (item, type) => {
  switch (type) {
    default:
    case 'rules': {
      let meta = {};
      try {
        meta = JSON.parse(item.metadataFile);
      } catch (e) {
        logger.info(`Cannot parse metadata of ${item.name} ${type}`);
      }

      const { order = 0, enabled = true, stage = 'login_success' } = meta;
      return ({ script: item.scriptFile, name: item.name, order, stage, enabled });
    }

    case 'pages': {
      let meta = {};
      try {
        meta = JSON.parse(item.metadataFile);
      } catch (e) {
        logger.info(`Cannot parse metadata of ${item.name} ${type}`);
      }

      const { enabled = true } = meta;
      return ({ html: item.htmlFile, name: item.name, enabled });
    }

    case 'emailTemplates': {
      if (item.name === 'provider') return null;
      let meta = item.metadataFile || {};
      try {
        meta = JSON.parse(item.metadataFile);
      } catch (e) {
        logger.info(`Cannot parse metadata of ${item.name} ${type}`);
      }
      return ({ ...meta, body: item.htmlFile });
    }

    case 'clientGrants':
    case 'emailProvider': {
      let data = item.configFile || {};
      try {
        data = JSON.parse(item.configFile);
      } catch (e) {
        logger.info(`Cannot parse metadata of ${item.name} ${type}`);
      }
      return ({ ...data });
    }

    case 'databases': {
      let settings = item.settings || {};
      try {
        settings = JSON.parse(item.settings);
      } catch (e) {
        logger.info(`Cannot parse settings of ${item.name} ${type}`);
      }
      const customScripts = {};
      const options = settings.options || {};

      _.forEach(item.scripts, (script) => { customScripts[script.name] = script.scriptFile; });

      if (item.scripts || item.scripts.length) {
        options.customScripts = customScripts;
        options.enabledDatabaseCustomization = true;
      }

      return ({ ...settings, options, strategy: 'auth0', name: item.name });
    }

    case 'resourceServers':
    case 'connections':
    case 'clients': {
      let meta = {};
      let data = {};
      try {
        data = JSON.parse(item.configFile);
      } catch (e) {
        logger.info(`Cannot parse config of ${item.name} ${type}`);
      }
      try {
        meta = JSON.parse(item.metadataFile);
      } catch (e) {
        logger.info(`Cannot parse metadata of ${item.name} ${type}`);
      }

      return ({ name: item.name, ...meta, ...data });
    }

    case 'rulesConfigs': {
      let data = {};
      try {
        data = JSON.parse(item.configFile);
      } catch (e) {
        logger.info(`Cannot parse config of ${item.name} ${type}`);
      }

      return ({ key: item.name, value: data.value });
    }
  }
};

const unifyData = (assets) => {
  const result = {};
  _.forEach(assets, (data, type) => {
    result[type] = [];
    if (Array.isArray(data)) {
      _.forEach(data, (item) => {
        const unified = unifyItem(item, type);
        if (unified) result[type].push(unified);
      });
    } else {
      result[type] = unifyItem(data, type);
    }
  });

  return result;
};

/*
 * Get the details of a database file script.
 */
const getDatabaseScriptDetails = (filename) => {
  const parts = filename.split('/');
  const length = parts.length;
  if (length >= 3 && /\.js$/i.test(parts[length - 1])) {
    const scriptName = path.parse(parts[length - 1]).name;
    if (constants.DATABASE_SCRIPTS.indexOf(scriptName) > -1) {
      return {
        database: parts[length - 2],
        name: path.parse(scriptName).name
      };
    }
  }
  return null;
};


/*
 * Get the database settings file.
 */
const getDatabaseSettingsDetails = (filename) => {
  const parts = filename.split('/');
  const length = parts.length;
  if (length >= 3 && parts[length - 1] === 'settings.json') {
    return {
      database: parts[length - 2],
      name: 'settings'
    };
  }
  return null;
};

/*
 * Only valid Javascript for Connections.
 */
const validConnectionsOnly = (fileName) => /\.(js)$/i.test(fileName) || fileName === 'settings.json';

/*
 * Only Javascript and JSON files.
 */
const validFilesOnly = (fileName) => {
  if (isTemplates(fileName, constants.PAGES_DIRECTORY, constants.PAGE_NAMES)) {
    return true;
  } else if (isTemplates(fileName, constants.EMAIL_TEMPLATES_DIRECTORY, constants.EMAIL_TEMPLATES_NAMES)) {
    return true;
  } else if (isEmailProvider(fileName)) {
    return true;
  } else if (isRule(fileName)) {
    return /\.(js|json)$/i.test(fileName);
  } else if (isConfigurable(fileName, constants.CLIENTS_DIRECTORY)) {
    return /\.(js|json)$/i.test(fileName);
  } else if (isConfigurable(fileName, constants.CLIENTS_GRANTS_DIRECTORY)) {
    return /\.(js|json)$/i.test(fileName);
  } else if (isConfigurable(fileName, constants.CONNECTIONS_DIRECTORY)) {
    return /\.(js|json)$/i.test(fileName);
  } else if (isConfigurable(fileName, constants.RESOURCE_SERVERS_DIRECTORY)) {
    return /\.(js|json)$/i.test(fileName);
  } else if (isConfigurable(fileName, constants.RULES_CONFIGS_DIRECTORY)) {
    return /\.(js|json)$/i.test(fileName);
  } else if (isDatabaseConnection(fileName)) {
    const script = !!getDatabaseScriptDetails(fileName);
    const settings = !!getDatabaseSettingsDetails(fileName);
    return script || settings;
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
 * Get by given path.
 */
const getTreeByPath = (projectId, branch, directory) =>
  getApi().Repositories.tree(projectId, {
    ref: branch,
    path: getBaseDir() + directory
  }).then((res) => {
    if (!res) {
      return [];
    }
    const files = res
      .filter(f => f.type === 'blob')
      .filter(f => validFilesOnly(f.path));

    files.forEach((elem, idx) => {
      files[idx].path = `${getBaseDir()}${directory}/${elem.name}`;
    });
    return files;
  });

/*
 * Get connection files for one db connection
 */
const getDBConnectionTreeByPath = (projectId, branch, filePath) =>
  getApi().Repositories.tree(projectId, {
    ref: branch,
    path: `${getBaseDir()}${constants.DATABASE_CONNECTIONS_DIRECTORY}/${filePath}`
  }).then((res) => {
    if (!res) {
      return [];
    }

    const files = res
      .filter(f => f.type === 'blob')
      .filter(f => validConnectionsOnly(f.name));

    files.forEach((elem, idx) => {
      files[idx].path = `${getBaseDir()}${constants.DATABASE_CONNECTIONS_DIRECTORY}/${filePath}/${elem.name}`;
    });

    return files;
  });

/*
 * Get all files for all database-connections.
 */
const getDBConnectionsTree = (projectId, branch) =>
  getApi().Repositories.tree(projectId, {
    ref: branch,
    path: getBaseDir() + constants.DATABASE_CONNECTIONS_DIRECTORY
  }).then((res) => {
    if (!res) {
      return [];
    }

    const subdirs = res.filter(f => f.type === 'tree');
    const promisses = [];
    let files = [];

    subdirs.forEach(subdir => {
      promisses.push(getDBConnectionTreeByPath(projectId, branch, subdir.name).then(data => {
        files = files.concat(data);
      }));
    });

    return Promise.all(promisses)
      .then(() => files);
  });
/*
 * Get full tree.
 */
const getTree = (projectId, branch) => {
  // Getting separate trees for rules and connections, as GitLab does not provide full (recursive) tree
  const promises = {
    rules: getTreeByPath(projectId, branch, constants.RULES_DIRECTORY),
    databases: getDBConnectionsTree(projectId, branch),
    emails: getTreeByPath(projectId, branch, constants.EMAIL_TEMPLATES_DIRECTORY),
    pages: getTreeByPath(projectId, branch, constants.PAGES_DIRECTORY),
    clients: getTreeByPath(projectId, branch, constants.CLIENTS_DIRECTORY),
    clientGrants: getTreeByPath(projectId, branch, constants.CLIENTS_GRANTS_DIRECTORY),
    connections: getTreeByPath(projectId, branch, constants.CONNECTIONS_DIRECTORY),
    rulesConfigs: getTreeByPath(projectId, branch, constants.RULES_CONFIGS_DIRECTORY),
    resourceServers: getTreeByPath(projectId, branch, constants.RESOURCE_SERVERS_DIRECTORY)
  };

  return Promise.props(promises)
    .then((result) => (_.union(
      result.rules,
      result.databases,
      result.emails,
      result.pages,
      result.clients,
      result.clientGrants,
      result.connections,
      result.rulesConfigs,
      result.resourceServers
    )));
};

/*
 * Download a single file.
 */
const downloadFile = (projectId, branch, file) =>
  getApi().RepositoryFiles.show(projectId, file.path, branch)
    .then((data) => ({
      fileName: file.path,
      contents: (new Buffer(data.content, 'base64')).toString()
    }));

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
 * Download a single configurable file.
 */
const downloadConfigurable = (projectId, branch, itemName, item) => {
  const downloads = [];
  const currentItem = {
    metadata: false,
    name: itemName
  };

  if (item.configFile) {
    downloads.push(downloadFile(projectId, branch, item.configFile)
      .then(file => {
        currentItem.configFile = file.contents;
      }));
  }

  if (item.metadataFile) {
    downloads.push(downloadFile(projectId, branch, item.metadataFile)
      .then(file => {
        currentItem.metadata = true;
        currentItem.metadataFile = file.contents;
      }));
  }

  return Promise.all(downloads).then(() => currentItem);
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
 * Get all configurables from certain directory.
 */
const getConfigurables = (projectId, branch, files, directory) => {
  const configurables = {};

  _.filter(files, f => isConfigurable(f.path, directory)).forEach(file => {
    let meta = false;
    let name = path.parse(file.path).name;
    const ext = path.parse(file.path).ext;
    configurables[name] = configurables[name] || {};

    if (ext === '.json') {
      if (name.endsWith('.meta')) {
        name = path.parse(name).name;
        meta = true;
      }

      /* Initialize object if needed */
      configurables[name] = configurables[name] || {};

      if (meta) {
        configurables[name].metadataFile = file;
      } else {
        configurables[name].configFile = file;
      }
    }
  });

  // Download all rules.
  return Promise.map(Object.keys(configurables), (key) =>
    downloadConfigurable(projectId, branch, key, configurables[key]), { concurrency: 2 });
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
        if (script.name === 'settings') {
          database.settings = file.contents;
        } else {
          database.scripts.push({
            name: script.name,
            scriptFile: file.contents
          });
        }
      })
    );
  });

  return Promise.all(downloads)
    .then(() => database);
};

/*
 * Get all database scripts.
 */
const getDatabaseData = (projectId, branch, files) => {
  const databases = {};

  _.filter(files, f => isDatabaseConnection(f.path)).forEach(file => {
    const script = getDatabaseScriptDetails(file.path);
    const settings = getDatabaseSettingsDetails(file.path);

    if (script) {
      databases[script.database] = databases[script.database] || [];
      databases[script.database].push({
        ...script,
        id: file.id,
        path: file.path
      });
    }

    if (settings) {
      databases[settings.database] = databases[settings.database] || [];
      databases[settings.database].push({
        ...settings,
        id: file.id,
        path: file.path
      });
    }
  });

  return Promise.map(Object.keys(databases), (databaseName) =>
    downloadDatabaseScript(projectId, branch, databaseName, databases[databaseName]), { concurrency: 2 });
};

/*
 * Download a single page or email script.
 */
const downloadTemplate = (projectId, branch, tplName, template) => {
  const downloads = [];
  const currentTpl = {
    metadata: false,
    name: tplName
  };

  if (template.file) {
    downloads.push(downloadFile(projectId, branch, template.file)
      .then(file => {
        currentTpl.htmlFile = file.contents;
      }));
  }

  if (template.meta_file) {
    downloads.push(downloadFile(projectId, branch, template.meta_file)
      .then(file => {
        currentTpl.metadata = true;
        currentTpl.metadataFile = file.contents;
      }));
  }

  return Promise.all(downloads)
    .then(() => currentTpl);
};

/*
 * Get all html templates - emails/pages.
 */
const getHtmlTemplates = (projectId, branch, files, dir, allowedNames) => {
  const templates = {};

  // Determine if we have the script, the metadata or both.
  _.filter(files, f => isTemplates(f.path, dir, allowedNames)).forEach(file => {
    const tplName = path.parse(file.path).name;
    const ext = path.parse(file.path).ext;
    templates[tplName] = templates[tplName] || {};

    if (ext !== '.json') {
      templates[tplName].file = file;
      templates[tplName].sha = file.sha;
      templates[tplName].path = file.path;
    } else {
      templates[tplName].meta_file = file;
      templates[tplName].meta_sha = file.sha;
      templates[tplName].meta_path = file.path;
    }
  });

  return Promise.map(Object.keys(templates), (name) =>
    downloadTemplate(projectId, branch, name, templates[name]), { concurrency: 2 });
};

/*
 * Get email provider.
 */
const getEmailProvider = (projectId, branch, files) =>
  downloadConfigurable(projectId, branch, 'emailProvider', { configFile: _.find(files, f => isEmailProvider(f.path)) });

/*
 * Get a list of all changes that need to be applied to rules and database scripts.
 */
export const getChanges = (projectId, branch) =>
  getTree(projectId, branch)
    .then(files => {
      logger.debug(`Files in tree: ${JSON.stringify(files.map(file => ({ name: file.path, id: file.id })), null, 2)}`);

      const promises = {
        rules: getRules(projectId, branch, files),
        databases: getDatabaseData(projectId, branch, files),
        emailProvider: getEmailProvider(projectId, branch, files),
        emailTemplates: getHtmlTemplates(projectId, branch, files, constants.EMAIL_TEMPLATES_DIRECTORY, constants.EMAIL_TEMPLATES_NAMES),
        pages: getHtmlTemplates(projectId, branch, files, constants.PAGES_DIRECTORY, constants.PAGE_NAMES),
        clients: getConfigurables(projectId, branch, files, constants.CLIENTS_DIRECTORY),
        clientGrants: getConfigurables(projectId, branch, files, constants.CLIENTS_GRANTS_DIRECTORY),
        connections: getConfigurables(projectId, branch, files, constants.CONNECTIONS_DIRECTORY),
        rulesConfigs: getConfigurables(projectId, branch, files, constants.RULES_CONFIGS_DIRECTORY),
        resourceServers: getConfigurables(projectId, branch, files, constants.RESOURCE_SERVERS_DIRECTORY)
      };

      return Promise.props(promises)
        .then((result) => unifyData(result));
    });

/*
 * Get a project id by path.
 */
export const getProjectId = (filePath) =>
  getApi().Projects.all({ membership: true }).then(projects => {
    if (!projects) {
      return Promise.reject(new Error('Unable to determine project ID'));
    }

    const currentProject = projects.filter(f => f.path_with_namespace === filePath);

    if (currentProject[0] && currentProject[0].id) {
      return currentProject[0].id;
    }

    return Promise.reject(new Error('Unable to determine project ID'));
  });
