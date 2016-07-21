import _ from 'lodash';
import path from 'path';
import Promise from 'bluebird';
import GitLabApi from 'gitlab';

import config from './config';
import logger from '../lib/logger';
import * as constants from './constants';

/*
 * GitLab API connection
 */

const gitlab = new GitLabApi({
	url: 'https://gitlab.com',
	token: config('GITLAB_TOKEN')
});

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
 * Only Javascript and JSON files.
 */
const validFilesOnly = (fileName) => {
	if (isRule(fileName)) {
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
 * Parse the repository.
 */
const parseRepo = (repository = '') => {
	const parts = repository.split('/');
	if (parts.length === 2) {
		const [ user, repo ] = parts;
		return {user, repo};
	} else if (parts.length === 5) {
		const [ , , , user, repo ] = parts;
		return {user, repo};
	}

	throw new Error(`Invalid repository: ${repository}`);
};

/*
 * Get rules tree.
 */
const getRulesTree = (projectId, branch) =>
	new Promise((resolve, reject) => {
		try {
			gitlab.projects.repository.listTree(projectId, {
				ref_name: branch,
				path: constants.RULES_DIRECTORY
			}, (res, err) => {
				if (err) {
					return reject(err);
				} else if (!res) {
					return resolve([]);
				}

				const files = res
					.filter(f => f.type === 'blob')
					.filter(f => validRulesOnly(f.name));

				files.forEach((elem, idx) => {
					files[idx].path = `${constants.RULES_DIRECTORY}/${elem.name}`
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
const getConnectionTreeByPath = (projectId, branch, path) =>
	new Promise((resolve, reject) => {
		try {
			gitlab.projects.repository.listTree(projectId, {
				ref_name: branch,
				path: `${constants.DATABASE_CONNECTIONS_DIRECTORY}/${path}`
			}, (res, err) => {
				if (err) {
					return reject(err);
				} else if (!res) {
					return resolve([]);
				}

				const files = res
					.filter(f => f.type === 'blob')
					.filter(f => validConnectionsOnly(f.name));

				files.forEach((elem, idx) => {
					files[idx].path = `${constants.DATABASE_CONNECTIONS_DIRECTORY}/${path}/${elem.name}`
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
			gitlab.projects.repository.listTree(projectId, {
				ref_name: branch,
				path: constants.DATABASE_CONNECTIONS_DIRECTORY
			}, (res, err) => {
				if (err) {
					return reject(err);
				} else if (!res) {
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

				Promise.all(promisses)
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
	//Getting separate trees for rules and connections, as GitLab does not provide full (recursive) tree
	const promises = {
		rules: getRulesTree(projectId, branch),
		connections: getConnectionsTree(projectId, branch)
	};

	return Promise.props(promises)
		.then((result) => (_.union(result.rules, result.connections)));
};

/*
 * Download a single file.
 */
const downloadFile = (projectId, branch, file) =>
	new Promise((resolve, reject) => {
		try {
			gitlab.projects.repository.showFile(projectId, {ref: branch, file_path: file.path}, (data, err) => {
				if (data) {
					return resolve({
						fileName: file.path,
						contents: (new Buffer(data.content, 'base64')).toString()
					});
				} else {
					logger.error(`Error downloading '${file.path}'`);
					logger.error(err);

					return reject(new Error(`Error downloading '${file.path}'`));
				}
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
		...rule,
		name: ruleName
	};

	const downloads = [];

	if (rule.script) {
		downloads.push(downloadFile(projectId, branch, rule.scriptFile)
			.then(file => {
				currentRule.script = file.contents;
			}));
	}

	if (rule.metadata) {
		downloads.push(downloadFile(projectId, branch, rule.metadataFile)
			.then(file => {
				currentRule.metadata = JSON.parse(file.contents);
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
	return Promise.map(Object.keys(rules), (ruleName) => downloadRule(projectId, branch, ruleName, rules[ruleName]), {concurrency: 2});
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
					stage: script.name,
					contents: file.contents
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

	return Promise.map(Object.keys(databases), (databaseName) => downloadDatabaseScript(projectId, branch, databaseName, databases[databaseName]), {concurrency: 2});
};

/*
 * Get a list of all changes that need to be applied to rules and database scripts.
 */
export const getChanges = (projectId, branch) =>
	getTree(projectId, branch)
		.then(files => {
			logger.debug(`Files in tree: ${JSON.stringify(files.map(file => ({name: file.path, id: file.id})), null, 2)}`);

			const promises = {
				rules: getRules(projectId, branch, files),
				databases: getDatabaseScripts(projectId, branch, files)
			};

			return Promise.props(promises)
				.then((result) => ({
					rules: result.rules,
					databases: result.databases
				}));
		});

/*
 * Get a project id by path.
 */
export const getProjectId = (path) =>
	new Promise((resolve, reject) => {
		try {
			gitlab.projects.all(projects => {
				if (!projects)
					return reject(new Error('Unable to determine project ID'));

				const currentProject = projects.filter(f => f.path_with_namespace === path);

				if (currentProject[0] && currentProject[0].id)
					return resolve(currentProject[0].id);
				else
					return reject(new Error('Unable to determine project ID'));
			});
		} catch (e) {
			reject(e);
		}
	});
