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
  // Used by Infra app entry when deploying and wiring props and deps between other stacks.
  public readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // AWS Lambda: unlike the Fargate sample's ContainerImage.fromAsset
    // (which builds the Spring Boot image from source at `cdk deploy` time),
    // this references a pre-built fat jar (`mvn package`) directly/locally (../../backend/target/items-lambda.jar).
    // API Gateway instead of Fargate ALB (App Load Balancer), without /health check possibility.
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

    // Validates JWT + client_id at the gateway, before the Lambda runs --
    // unlike the Fargate sample, which checks in-app (SecurityConfig.java).
    // ItemsHandler itself does no token validation.
    const authorizer = new authorizers.HttpUserPoolAuthorizer('CognitoAuthorizer', props.userPool, {
      userPoolClients: [props.userPoolClient],
    });

    // CORS is needed only for local-dev because it calls this deployed API Gateway
    // directly from localhost:4200, which is cross-origin.
    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['http://localhost:4200'],
        allowMethods: [apigwv2.CorsHttpMethod.GET],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    // Substitute just SpringBoot's controller dispatcher annotation (@RestController/@GetMapping).
    this.httpApi.addRoutes({
      path: '/api/items',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('ItemsIntegration', itemsFunction),
      authorizer,
    });

    // If you execute stacks directly with cdk deploy, you can see these outputs in the console (like info return messages).
    new cdk.CfnOutput(this, 'ApiUrl', { value: this.httpApi.apiEndpoint });
  }
}
