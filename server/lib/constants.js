export const RULES_DIRECTORY = 'rules';

export const DATABASE_CONNECTIONS_DIRECTORY = 'database-connections';

export const PAGES_DIRECTORY = 'pages';

export const DATABASE_SCRIPTS = [
  'get_user',
  'create',
  'verify',
  'login',
  'change_password',
  'delete'
];

export const PAGE_NAMES = [
  'password_reset.html',
  'password_reset.json',
  'login.html',
  'login.json'
];

export const RULES_STAGES = [
  'login_success',
  'login_failure',
  'pre_authorize',
  'user_registration',
  'user_blocked'
];

export const CONCURRENT_CALLS = 5;
