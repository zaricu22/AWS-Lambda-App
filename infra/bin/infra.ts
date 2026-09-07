#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { BackendStack } from '../lib/backend-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Cognito needs the CloudFront callback/logout URLs, but the CloudFront
// domain isn't known until FrontendStack deploys once. Workflow: deploy
// everything first (localhost callback only), read FrontendStack's SiteUrl
// output, then re-run `cdk deploy LambdaAuthStack` with these env vars set
// so the Hosted UI path also works against the deployed site. See README.
const cloudFrontCallbackUrl = process.env.CLOUDFRONT_CALLBACK_URL;
const cloudFrontLogoutUrl = process.env.CLOUDFRONT_LOGOUT_URL;

// Stack ids are prefixed 'Lambda' (rather than reusing 'AuthStack' etc. from
// the sibling Fargate sample) because CloudFormation stacks are identified
// by name within an account+region, not by which local CDK app synthesized
// them -- deploying this app with the Fargate sample's stack names into the
// same account/region would update/collide with THAT sample's stacks.
const authStack = new AuthStack(app, 'LambdaAuthStack', {
  env,
  cognitoDomainPrefix: process.env.COGNITO_DOMAIN_PREFIX ?? 'items-lambda-app',
  callbackUrls: [
    'http://localhost:4200/callback',
    ...(cloudFrontCallbackUrl ? [cloudFrontCallbackUrl] : []),
  ],
  logoutUrls: [
    'http://localhost:4200/login',
    ...(cloudFrontLogoutUrl ? [cloudFrontLogoutUrl] : []),
  ],
});

const dataStack = new DataStack(app, 'LambdaDataStack', { env });

const backendStack = new BackendStack(app, 'LambdaBackendStack', {
  env,
  itemsTable: dataStack.itemsTable,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
});
backendStack.addStackDependency(authStack);
backendStack.addStackDependency(dataStack);

const frontendStack = new FrontendStack(app, 'LambdaFrontendStack', {
  env,
  httpApi: backendStack.httpApi,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  userPoolDomain: authStack.userPoolDomain,
});
frontendStack.addStackDependency(backendStack);
