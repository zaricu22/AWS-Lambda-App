import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface BackendStackProps extends cdk.StackProps {
  itemsTable: dynamodb.Table;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
}

export class BackendStack extends cdk.Stack {
  public readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // AWS: unlike the Fargate sample's ContainerImage.fromAsset (which
    // builds the Spring Boot image from source at `cdk deploy` time), this
    // references a pre-built fat jar directly -- there is no Docker
    // bundling step here. Run `mvn package` in backend/ before deploying
    // this stack (see README "Build the Lambda jar").
    const itemsFunction = new lambda.Function(this, 'ItemsFunction', {
      runtime: lambda.Runtime.JAVA_17,
      architecture: lambda.Architecture.ARM_64,
      handler: 'com.example.items.ItemsHandler::handleRequest',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'backend', 'target', 'items-lambda.jar')),
      memorySize: 512,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: props.itemsTable.tableName,
      },
    });
    props.itemsTable.grantReadData(itemsFunction);

    // AWS: HttpUserPoolAuthorizer validates the Cognito-issued JWT (and
    // matches Cognito's client_id claim against userPoolClients) directly
    // at the API Gateway layer, before the Lambda ever runs. Contrast with
    // the Fargate sample, where Spring Security's OAuth2 resource server
    // (SecurityConfig.java + CognitoClientIdValidator) does the equivalent
    // check inside the running app. ItemsHandler itself performs no token
    // validation -- if it's invoked at all, API Gateway already accepted
    // the caller's token.
    const authorizer = new authorizers.HttpUserPoolAuthorizer('CognitoAuthorizer', props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    // CORS is needed here because there's no local emulator for this
    // backend (see CLAUDE.md) -- local dev calls this deployed API Gateway
    // directly from localhost:4200, which is cross-origin. In production
    // the SPA calls same-origin '/api/*' through CloudFront (see
    // FrontendStack), so CORS never applies there.
    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['http://localhost:4200'],
        allowMethods: [apigwv2.CorsHttpMethod.GET],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    this.httpApi.addRoutes({
      path: '/api/items',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('ItemsIntegration', itemsFunction),
      authorizer,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }
}
