const devServer = require('auth0-extensions-cli/lib/dev-server');

const rootPath = process.cwd();
const entry = './client/app.jsx';
const destination = './dist';

devServer(rootPath, entry, destination);
