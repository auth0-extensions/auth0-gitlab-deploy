# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Added
- Ability to deploy db-connection settings by adding `/database-connections/[connection-name]/settings.json`.

## [2.6.0] - 2018-12-18

### Fixed
- Options reset on `databases` update issue. #35
- Database Scripts under non root `BASE_DIR`. #36

## [2.5.0] - 2018-11-29

### Added
- `Custom Webhook` to send deploy reports.
- `Email Templates`, `Email Provider`, `Resource Servers`, `Client Grants` support.
