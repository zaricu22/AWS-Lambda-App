import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface FrontendStackProps extends cdk.StackProps {
  httpApi: apigwv2.HttpApi;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  userPoolDomain: cognito.UserPoolDomain;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // AWS's CDN (CloudFront): public HTTPS endpoint browsers actually hit — it does not serve files itself;
    // it's a routing/caching layer that pulls content from one or more origins
    // (S3 buckets, HTTP APIs, ALBs, etc.) and caches/serves it to users.
    // Because the frontend bucket and backend HTTP API sit behind the same distribution, no CORS policy is needed in prod.
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      // Frontend Bucket route:
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // Backend HTTP API route:
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(`${props.httpApi.apiId}.execute-api.${this.region}.amazonaws.com`, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      // SiteS3Bucket doesn't allow public or direct access to its containing resources,
      // also S3/CloudFront doesn't know anything about Angular's routes,
      // so in case of violation we should transfer raw S3 404 to index.html.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    const cognitoDomain = `https://${props.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`;

    // Written directly from CDK-known values so redeploying infra alone
    // (without an `ng build`) still reaches the frontend on next page load.
    new s3deploy.BucketDeployment(this, 'DeployRuntimeConfig', {
      sources: [
        s3deploy.Source.jsonData('runtime-config.json', {
          cognitoUserPoolId: props.userPool.userPoolId,
          cognitoClientId: props.userPoolClient.userPoolClientId,
          cognitoDomain,
          region: this.region,
          apiBaseUrl: '/api',
        }),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/runtime-config.json'],
      cacheControl: [s3deploy.CacheControl.noCache()],
      prune: false,
    });

    // Hashed JS/CSS bundles: long cache, safe because Angular's build hashes
    // filenames on every change.
    new s3deploy.BucketDeployment(this, 'DeploySiteAssets', {
      sources: [s3deploy.Source.asset('../frontend/dist/frontend/browser')],
      destinationBucket: siteBucket,
      cacheControl: [s3deploy.CacheControl.maxAge(cdk.Duration.days(365))],
      exclude: ['index.html'],
      prune: false,
    });

    // index.html: no-cache, so a new deploy is picked up immediately.
    new s3deploy.BucketDeployment(this, 'DeployIndexHtml', {
      sources: [s3deploy.Source.asset('../frontend/dist/frontend/browser', { exclude: ['*', '!index.html'] })],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/index.html', '/'],
      cacheControl: [s3deploy.CacheControl.noCache()],
      prune: false,
    });

    // If you execute stacks directly with cdk deploy, you can see these outputs in the console (like info return messages).
    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
  }
}
