#!/usr/bin/env node
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env files
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack';
import { CertStack } from '../lib/CertStack';

const app = new cdk.App();

const hostedZoneId = process.env.HOSTED_ZONE_ID || app.node.tryGetContext('hostedZoneId');
const zoneName = process.env.ZONE_NAME || app.node.tryGetContext('zoneName') || 'resume.grtmkr.com';
const connectionArn = process.env.CODESTAR_CONNECTION_ARN || app.node.tryGetContext('connectionArn');
const githubOwner = process.env.GITHUB_OWNER || app.node.tryGetContext('githubOwner') || 'gorkster';
const githubRepo = process.env.GITHUB_REPO || app.node.tryGetContext('githubRepo') || 'resumesite';
const githubBranch = process.env.GITHUB_BRANCH || app.node.tryGetContext('githubBranch') || 'main';

new CertStack(app, 'CertStack', {
  env: { region: 'us-east-1', account: process.env.CDK_DEFAULT_ACCOUNT },
  hostedZoneId,
  zoneName,
});

new InfraStack(app, 'InfraStack', {
  env: { region: 'us-east-2', account: process.env.CDK_DEFAULT_ACCOUNT },
  hostedZoneId,
  zoneName,
  connectionArn,
  githubOwner,
  githubRepo,
  githubBranch,
});

// Add tags to everything in the stack
cdk.Tags.of(app).add('Project', 'ResumeSite');
cdk.Tags.of(app).add('repository', 'resumesite');
cdk.Tags.of(app).add('Environment', 'Personal');

