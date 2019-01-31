# Auth0 GitLab Deployments

## Move Notice

Beginning with the `2.7` release of this extension, we have moved from separate repositories for each of the deployment extensions (github, gitlab, bitbucket, and visualstudio) to building and deploying via a single `auth0-deploy-extensions` monorepo. This approach will make maintainence and issue tracking across all four extensions much easier for Auth0 and more timely for our customers.

The new monorepo can be found here: [auth0-deploy-extensions](https://github.com/auth0-extensions/auth0-deploy-extensions)

## Warning

Beginning with version 2.4, the Gitlab extension only works with Node 8 because of dependencies in `gitlab@3.4.2`. Please update according to [Migration Guide: Extensibility and Node 8](https://auth0.com/docs/migrations/guides/extensibility-node8) if you have not already.
